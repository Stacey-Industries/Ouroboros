#!/usr/bin/env python3
"""Train context ranker classifier and export weights for TypeScript inference.

Usage:
    python tools/train-context.py \\
        --decisions <path-to-context-decisions.jsonl> \\
        --outcomes  <path-to-context-outcomes.jsonl>   \\
        --out       <path-to-context-retrained-weights.json> \\
        [--min-samples 1000] [--test-split 0.2] [--random-seed 42]

Requirements:
    pip install scikit-learn numpy

Input files:
    context-decisions.jsonl — one ContextDecision row per (traceId, fileId).
        Fields: id, traceId, fileId, features{score, reasons, pagerank_score,
                included}, score, included.
    context-outcomes.jsonl  — one ContextOutcome row per (traceId, fileId).
        Fields: traceId, fileId, sessionId, timestamp, kind, toolKind,
                toolUsed, decisionId, schemaVersion.

Output:
    context-retrained-weights.json — logistic weights + metadata.
    Stdout:  "trained samples=N auc=0.xx version=<ISO>"
    Stderr:  warnings only.
"""

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Dependency check — give a clear error before numpy/sklearn ImportError noise
# ---------------------------------------------------------------------------
try:
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import train_test_split
except ImportError as exc:
    print(f"ERROR: Missing dependency — {exc}", file=sys.stderr)
    print("Install with:  pip install scikit-learn numpy", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Canonical feature order — must match featureOrder in the output JSON and
# Phase B's contextClassifier.ts.
# ---------------------------------------------------------------------------
NUMERIC_FEATURES = [
    "recencyScore",
    "pagerankScore",
    "importDistance",
    "keywordOverlap",
    "prevUsedCount",
]

TOOLKIND_VALUES = ["read", "edit", "write", "other"]
TOOLKIND_FEATURES = [f"toolKindHint_{v}" for v in TOOLKIND_VALUES]

FEATURE_NAMES = NUMERIC_FEATURES + TOOLKIND_FEATURES

# Reasons-array kind → feature name mapping.
# Keys are the `kind` strings emitted by contextSelector.ts reason builders.
REASON_TO_FEATURE: dict[str, str] = {
    "recent_edit":      "recencyScore",
    "import_adjacency": "importDistance",
    "keyword_match":    "keywordOverlap",
}

# Track which missing columns we have already warned about (warn-once).
_warned_missing: set[str] = set()


# ---------------------------------------------------------------------------
# JSONL loading
# ---------------------------------------------------------------------------

def load_jsonl(path: Path) -> list[dict]:
    """Load a JSONL file, skipping malformed lines with a stderr warning."""
    records: list[dict] = []
    with open(path, encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                print(
                    f"  WARN: skipping malformed JSON on line {lineno} of "
                    f"{path.name}: {exc}",
                    file=sys.stderr,
                )
    return records


# ---------------------------------------------------------------------------
# Feature extraction from a ContextDecision row
# ---------------------------------------------------------------------------

def _warn_missing(feature: str) -> None:
    if feature not in _warned_missing:
        _warned_missing.add(feature)
        print(
            f"  WARN: feature '{feature}' absent from decisions row — defaulting to 0.0",
            file=sys.stderr,
        )


def extract_numeric_features(decision: dict) -> dict[str, float]:
    """Extract normalised numeric features from a ContextDecision row.

    Reads from decision.features.{pagerank_score, reasons[]} plus the top-level
    decision.features.score.  prevUsedCount is not stored in the JSONL at this
    wave — defaults to 0.0 with a warn-once message.
    """
    feats_raw = decision.get("features", {})
    reasons: list[dict] = feats_raw.get("reasons", []) if isinstance(feats_raw, dict) else []

    # Build a reason-kind → normalised weight map (weight is already the raw
    # additive weight; we clip to [0,1] below).
    reason_weights: dict[str, float] = {}
    for r in reasons:
        kind = r.get("kind", "")
        weight = float(r.get("weight", 0.0))
        if kind in REASON_TO_FEATURE:
            # Accumulate — keyword_match and import_adjacency can appear multiple
            # times; we take the sum and clip afterwards.
            reason_weights[kind] = reason_weights.get(kind, 0.0) + weight

    result: dict[str, float] = {}

    # pagerank_score
    pagerank_raw = feats_raw.get("pagerank_score") if isinstance(feats_raw, dict) else None
    if pagerank_raw is None:
        _warn_missing("pagerankScore")
        result["pagerankScore"] = 0.0
    else:
        result["pagerankScore"] = float(pagerank_raw)

    # prevUsedCount — not in JSONL yet (Phase B will add it)
    _warn_missing("prevUsedCount")
    result["prevUsedCount"] = 0.0

    # Reason-derived features
    for reason_kind, feat_name in REASON_TO_FEATURE.items():
        if reason_kind in reason_weights:
            result[feat_name] = reason_weights[reason_kind]
        else:
            result[feat_name] = 0.0

    return result


def clip_and_warn(value: float, name: str) -> float:
    """Clip a feature value to [0, 1] with a warn-once stderr message."""
    if value < 0.0 or value > 1.0:
        if name not in _warned_missing:
            print(
                f"  WARN: feature '{name}' out of range ({value:.4f}) — clipping to [0, 1]",
                file=sys.stderr,
            )
            _warned_missing.add(name)
        return max(0.0, min(1.0, value))
    return value


def extract_feature_vector(
    decision: dict,
    toolkind_hint: Optional[str],
) -> list[float]:
    """Build the full feature vector (FEATURE_NAMES order) for one training row."""
    numeric = extract_numeric_features(decision)

    row: list[float] = []
    for fname in NUMERIC_FEATURES:
        val = numeric.get(fname, 0.0)
        val = clip_and_warn(val, fname)
        row.append(val)

    # One-hot for toolKindHint
    for tkval in TOOLKIND_VALUES:
        row.append(1.0 if toolkind_hint == tkval else 0.0)

    return row


# ---------------------------------------------------------------------------
# Data join and label derivation
# ---------------------------------------------------------------------------

def build_dataset(
    decisions: list[dict],
    outcomes: list[dict],
) -> tuple[
    "np.ndarray",
    "np.ndarray",
    "np.ndarray",
    int,
]:
    """Join decisions ↔ outcomes on (traceId, fileId) and build (X, y, weights).

    Label derivation:
      - outcome toolKind ∈ {edit, write} → label 1, sample_weight 1.0
      - outcome toolKind == read         → label 1, sample_weight 0.5
      - outcome toolKind == other        → label 0, sample_weight 1.0
      - no matching outcome              → label 0, sample_weight 1.0
      - missed (outcome exists but no decision row) → synthetic negative;
        NOT included in training (no feature vector).

    Returns (X, y, sample_weights, n_synthetic).
    """
    print("-- Building outcome index ------------------------------------")

    # Index outcomes by (traceId, fileId)
    outcome_index: dict[tuple[str, str], dict] = {}
    for row in outcomes:
        tid = row.get("traceId", "")
        fid = row.get("fileId", "")
        if not tid or not fid:
            continue
        key = (tid, fid)
        # Keep last outcome if multiple (shouldn't happen, but be safe)
        outcome_index[key] = row

    # Index decision rows for the synthetic-negative diagnostic
    decision_keys: set[tuple[str, str]] = set()
    decision_index: dict[tuple[str, str], dict] = {}
    for row in decisions:
        tid = row.get("traceId", "")
        fid = row.get("fileId", "")
        if not tid or not fid:
            continue
        key = (tid, fid)
        decision_keys.add(key)
        decision_index[key] = row

    # Count synthetic negatives (outcomes with no matching decision)
    n_synthetic = 0
    for ok in outcome_index:
        if ok not in decision_keys:
            n_synthetic += 1

    print(f"  Decision rows : {len(decisions)}")
    print(f"  Outcome rows  : {len(outcomes)}")
    print(f"  Synthetic neg (missed, no features) : {n_synthetic}")

    # Build training rows from decisions
    X_rows: list[list[float]] = []
    y_rows: list[int] = []
    w_rows: list[float] = []

    pos_count = 0
    neg_count = 0

    for key, dec in decision_index.items():
        outcome = outcome_index.get(key)
        toolkind_hint: Optional[str] = outcome.get("toolKind") if outcome else None
        feature_vec = extract_feature_vector(dec, toolkind_hint)

        if outcome is None:
            label = 0
            weight = 1.0
        else:
            tool_kind = outcome.get("toolKind", "other")
            if tool_kind in ("edit", "write"):
                label = 1
                weight = 1.0
            elif tool_kind == "read":
                label = 1
                weight = 0.5
            else:
                # toolKind == 'other' — agent touched a file but with an
                # unclassified tool; treat as negative
                label = 0
                weight = 1.0

        X_rows.append(feature_vec)
        y_rows.append(label)
        w_rows.append(weight)
        if label == 1:
            pos_count += 1
        else:
            neg_count += 1

    print(f"  Training rows : {len(X_rows)} (pos={pos_count}, neg={neg_count})")

    X = np.array(X_rows, dtype=np.float64)
    y = np.array(y_rows, dtype=np.int32)
    w = np.array(w_rows, dtype=np.float64)

    return X, y, w, n_synthetic


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train(
    X_train: "np.ndarray",
    y_train: "np.ndarray",
    w_train: "np.ndarray",
    random_seed: int,
) -> LogisticRegression:
    """Fit a LogisticRegression with balanced class weights and sample weights."""
    print("\n-- Logistic Regression ---------------------------------------")
    clf = LogisticRegression(
        max_iter=1000,
        random_state=random_seed,
        class_weight="balanced",
    )
    clf.fit(X_train, y_train, sample_weight=w_train)
    return clf


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train context ranker classifier and export weights.",
    )
    parser.add_argument(
        "--decisions",
        type=Path,
        required=True,
        help="Path to context-decisions.jsonl",
    )
    parser.add_argument(
        "--outcomes",
        type=Path,
        required=True,
        help="Path to context-outcomes.jsonl",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Output path for context-retrained-weights.json",
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=1000,
        metavar="N",
        help="Minimum training samples before warning (default: 1000)",
    )
    parser.add_argument(
        "--test-split",
        type=float,
        default=0.2,
        metavar="FRAC",
        help="Held-out test fraction for AUC computation (default: 0.2)",
    )
    parser.add_argument(
        "--random-seed",
        type=int,
        default=42,
        metavar="SEED",
        help="Random seed for train/test split and model (default: 42)",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = parse_args()

    # Validate input files
    if not args.decisions.exists():
        print(f"ERROR: decisions file not found: {args.decisions}", file=sys.stderr)
        sys.exit(1)
    if not args.outcomes.exists():
        print(f"ERROR: outcomes file not found: {args.outcomes}", file=sys.stderr)
        sys.exit(1)

    print("-- Loading data ----------------------------------------------")
    decisions = load_jsonl(args.decisions)
    outcomes = load_jsonl(args.outcomes)

    X, y, w, n_synthetic = build_dataset(decisions, outcomes)

    n_samples = len(y)
    below_min = n_samples < args.min_samples
    if below_min:
        print(
            f"  WARN: only {n_samples} training samples (< min {args.min_samples}). "
            "Weights will be emitted for dev/shadow use; do not promote to production.",
            file=sys.stderr,
        )

    if n_samples == 0:
        print("ERROR: No training rows — cannot fit model.", file=sys.stderr)
        sys.exit(1)

    # Need at least 2 classes to stratify and compute AUC.
    unique_labels = np.unique(y)
    if len(unique_labels) < 2:
        print(
            "ERROR: Only one class present in training data — "
            "cannot compute AUC or fit a meaningful classifier.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"\n-- Train / test split (stratified {1 - args.test_split:.0%}/{args.test_split:.0%}) --")
    X_train, X_test, y_train, y_test, w_train, _ = train_test_split(
        X,
        y,
        w,
        test_size=args.test_split,
        random_state=args.random_seed,
        stratify=y,
    )
    print(f"  Train : {len(X_train)} samples")
    print(f"  Test  : {len(X_test)} samples")

    clf = train(X_train, y_train, w_train, args.random_seed)

    # Held-out AUC
    y_proba = clf.predict_proba(X_test)[:, 1]
    auc = float(roc_auc_score(y_test, y_proba))
    print(f"\n  Held-out AUC : {auc:.4f}")

    # Weight extraction — LogisticRegression binary: coef_ shape (1, n_features)
    weights: list[float] = clf.coef_[0].tolist()
    bias: float = float(clf.intercept_[0])

    # Class balance
    pos_count = int(np.sum(y == 1))
    neg_count = int(np.sum(y == 0))

    version = datetime.now(UTC).isoformat()

    payload: dict = {
        "version": version,
        "featureOrder": FEATURE_NAMES,
        "weights": weights,
        "bias": bias,
        "metrics": {
            "samples": n_samples,
            "syntheticNegatives": n_synthetic,
            "heldOutAuc": round(auc, 6),
            "trainedAt": version,
            "belowMinSamples": below_min,
            "classBalance": {
                "pos": pos_count,
                "neg": neg_count,
            },
        },
    }

    # Write output
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)

    print(f"\n-- Export ----------------------------------------------------")
    print(f"  Written to : {args.out}")
    print(f"  Features   : {len(FEATURE_NAMES)}")
    print(f"  AUC        : {auc:.4f}")

    # One-line stdout summary for the Node-side retrainTrigger parser
    print(f"trained samples={n_samples} auc={auc:.4f} version={version}")


if __name__ == "__main__":
    main()
