#!/usr/bin/env python3
"""Train model router classifier and export weights for TypeScript inference.

Usage:
    python tools/train-router.py
    python tools/train-router.py --input-dir /path/to/data
    python tools/train-router.py --input-dir /path/to/data --output-path /path/to/weights.json

Requirements:
    pip install scikit-learn numpy

Input files (--input-dir or repo root):
    router-full-extracted.jsonl
    router-full-judged.jsonl

Output (--output-path or default):
    src/main/router/model/router-weights.json
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Dependency check — give a clear error before numpy/sklearn ImportError noise
# ---------------------------------------------------------------------------
try:
    import numpy as np
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import classification_report, confusion_matrix
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
except ImportError as exc:
    print(f"ERROR: Missing dependency — {exc}", file=sys.stderr)
    print("Install with:  pip install scikit-learn numpy", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Paths (overridable via CLI args)
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_DIR = REPO_ROOT
DEFAULT_OUTPUT_PATH = REPO_ROOT / "src" / "main" / "router" / "model" / "router-weights.json"

# ---------------------------------------------------------------------------
# Canonical feature order — must match FEATURE_NAMES in routerTypes.ts
# ---------------------------------------------------------------------------
FEATURE_NAMES = [
    "promptCharLength",
    "wordCount",
    "questionMarkCount",
    "sentenceCount",
    "containsCodeBlock",
    "containsFilePath",
    "filePathCount",
    "judgmentWordCount",
    "planningWordCount",
    "implementationWordCount",
    "lookupWordCount",
    "ambiguityWordCount",
    "scopeWordCount",
    "prevMessageIsAssistant",
    "prevAssistantEndsWithQuestion",
    "prevAssistantLength",
    "prevAssistantIsPlan",
    "isPastedOnly",
    "slashCommandPresent",
]

LABEL_NAMES = ["HAIKU", "SONNET", "OPUS"]
LABEL_TO_INT = {"HAIKU": 0, "SONNET": 1, "OPUS": 2}

# ---------------------------------------------------------------------------
# Word / phrase lists — mirror featureExtractor.ts exactly
# ---------------------------------------------------------------------------
JUDGMENT_WORDS = [
    "think", "should", "recommend", "evaluate", "opinion",
    "approach", "better", "improve", "review", "assess",
]
PLANNING_WORDS = [
    "plan", "architect", "design", "spec", "scope",
    "strategy", "roadmap", "phase",
]
IMPLEMENTATION_WORDS = [
    "add", "fix", "change", "implement", "create",
    "build", "update", "remove", "delete", "refactor", "move",
]
LOOKUP_PHRASES = [
    "what is", "where is", "show me", "how does", "explain", "what does",
]
AMBIGUITY_WORDS = [
    " or ", "maybe", "not sure", "might", "could", "alternative", "either",
]
SCOPE_WORDS = [
    "entire", "whole", " all ", "across", "everything", "system", "codebase",
]

# Mirrors the TypeScript FILE_PATH_RE
FILE_PATH_RE = re.compile(
    r"(?:[a-zA-Z]:\\[\w\\./]+|src\\[\w\\./]+|[\w./]+\.(?:ts|tsx|js|json|md|css))"
)
# Matches sentence-ending punctuation followed by whitespace or end of string
SENTENCE_SPLIT_RE = re.compile(r"[.!?](?:\s|$)")

# ---------------------------------------------------------------------------
# Feature extraction helpers — mirror featureExtractor.ts
# ---------------------------------------------------------------------------

def count_word_matches(text: str, words: list[str]) -> int:
    lower = text.lower()
    return sum(lower.count(w) for w in words)


def extract_path_features(prompt: str) -> tuple[int, int]:
    matches = FILE_PATH_RE.findall(prompt)
    return (1 if matches else 0), len(matches)


def bucket_prev_length(length: int) -> int:
    if length == 0:
        return 0
    if length < 200:
        return 1
    if length <= 500:
        return 2
    return 3


def is_plan(msg: str) -> int:
    """Returns 1 if msg looks like a plan (>500 chars + structural markers)."""
    if len(msg) <= 500:
        return 0
    has_pipe    = "|" in msg
    has_heading = "##" in msg
    has_numbered = bool(re.search(r"\d+\.", msg))
    has_bullet   = bool(re.search(r"^- ", msg, re.MULTILINE))
    return 1 if (has_pipe or has_heading or has_numbered or has_bullet) else 0


def extract_prev_features(context_window) -> dict[str, int]:
    """Extract features from the last assistant message in context_window."""
    defaults = {
        "prevMessageIsAssistant": 0,
        "prevAssistantEndsWithQuestion": 0,
        "prevAssistantLength": 0,
        "prevAssistantIsPlan": 0,
    }
    if not context_window:
        return defaults

    # Find the last assistant entry
    last_assistant = None
    for entry in context_window:
        if isinstance(entry, dict) and entry.get("role") == "assistant":
            last_assistant = entry

    if last_assistant is None:
        return defaults

    # Normalise content — may be a string or a list of content blocks
    content = last_assistant.get("content", "")
    if isinstance(content, list):
        # Extract text from content blocks
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        content = "".join(parts)

    if not isinstance(content, str):
        content = str(content)

    if not content:
        return defaults

    return {
        "prevMessageIsAssistant": 1,
        "prevAssistantEndsWithQuestion": 1 if content.rstrip().endswith("?") else 0,
        "prevAssistantLength": bucket_prev_length(len(content)),
        "prevAssistantIsPlan": is_plan(content),
    }


def extract_features(prompt: str, context_window) -> list[float]:
    """
    Extracts all FEATURE_NAMES features in canonical order.
    Returns a list of floats ready for a numpy row.
    """
    if not isinstance(prompt, str):
        prompt = ""

    lower = prompt.lower()
    words = prompt.strip().split() if prompt.strip() else []
    sentence_matches = SENTENCE_SPLIT_RE.findall(prompt)
    sentence_count = max(1, len(sentence_matches))

    contains_file_path, file_path_count = extract_path_features(prompt)
    prev = extract_prev_features(context_window)

    feature_map = {
        "promptCharLength":          float(len(prompt)),
        "wordCount":                 float(len(words)),
        "questionMarkCount":         float(prompt.count("?")),
        "sentenceCount":             float(sentence_count),
        "containsCodeBlock":         1.0 if "```" in prompt else 0.0,
        "containsFilePath":          float(contains_file_path),
        "filePathCount":             float(file_path_count),
        "judgmentWordCount":         float(count_word_matches(lower, JUDGMENT_WORDS)),
        "planningWordCount":         float(count_word_matches(lower, PLANNING_WORDS)),
        "implementationWordCount":   float(count_word_matches(lower, IMPLEMENTATION_WORDS)),
        "lookupWordCount":           float(count_word_matches(lower, LOOKUP_PHRASES)),
        "ambiguityWordCount":        float(count_word_matches(lower, AMBIGUITY_WORDS)),
        "scopeWordCount":            float(count_word_matches(lower, SCOPE_WORDS)),
        "prevMessageIsAssistant":    float(prev["prevMessageIsAssistant"]),
        "prevAssistantEndsWithQuestion": float(prev["prevAssistantEndsWithQuestion"]),
        "prevAssistantLength":       float(prev["prevAssistantLength"]),
        "prevAssistantIsPlan":       float(prev["prevAssistantIsPlan"]),
        "isPastedOnly":              1.0 if re.match(r"^\[Pasted text #\d+", prompt) else 0.0,
        "slashCommandPresent":       1.0 if prompt.startswith("/") else 0.0,
    }

    return [feature_map[name] for name in FEATURE_NAMES]


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_jsonl(path: Path) -> list[dict]:
    records = []
    with open(path, encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                print(f"  WARN: skipping malformed JSON on line {lineno} of {path.name}: {exc}")
    return records


def load_and_join(input_dir: Path) -> list[dict]:
    print("-- Loading data ----------------------------------------------")
    extracted_path = input_dir / "router-full-extracted.jsonl"
    judged_path    = input_dir / "router-full-judged.jsonl"

    if not extracted_path.exists():
        print(f"ERROR: {extracted_path} not found", file=sys.stderr)
        sys.exit(1)
    if not judged_path.exists():
        print(f"ERROR: {judged_path} not found", file=sys.stderr)
        sys.exit(1)

    extracted = load_jsonl(extracted_path)
    judged    = load_jsonl(judged_path)

    print(f"  Extracted records : {len(extracted)}")
    print(f"  Judged records    : {len(judged)}")

    judged_by_id = {r["id"]: r for r in judged}
    joined = []
    for rec in extracted:
        jrec = judged_by_id.get(rec.get("id"))
        if jrec is None:
            continue
        merged = {**rec, **jrec}
        joined.append(merged)

    print(f"  Joined (by id)    : {len(joined)}")
    return joined


# ---------------------------------------------------------------------------
# Dataset preparation
# ---------------------------------------------------------------------------

def prepare_dataset(records: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    print("\n-- Filtering & feature extraction ----------------------------")

    kept = [r for r in records if r.get("confidence") in ("HIGH", "MEDIUM")]
    dropped = len(records) - len(kept)
    print(f"  Dropped (LOW confidence / missing) : {dropped}")
    print(f"  Kept for training                  : {len(kept)}")

    if not kept:
        print("ERROR: No records remain after filtering.", file=sys.stderr)
        sys.exit(1)

    # Label distribution
    from collections import Counter
    dist = Counter(r.get("judged_tier", "UNKNOWN") for r in kept)
    print(f"  Label distribution : {dict(dist)}")

    X_rows = []
    y_rows = []
    skipped = 0
    for rec in kept:
        tier = rec.get("judged_tier")
        if tier not in LABEL_TO_INT:
            skipped += 1
            continue
        features = extract_features(
            rec.get("prompt", ""),
            rec.get("context_window"),
        )
        X_rows.append(features)
        y_rows.append(LABEL_TO_INT[tier])

    if skipped:
        print(f"  Skipped (unknown tier)             : {skipped}")

    X = np.array(X_rows, dtype=np.float64)
    y = np.array(y_rows, dtype=np.int32)

    print(f"  Feature matrix shape               : {X.shape}")
    return X, y


# ---------------------------------------------------------------------------
# Model export helpers
# ---------------------------------------------------------------------------

def export_random_forest(clf: RandomForestClassifier) -> dict:
    trees = []
    for estimator in clf.estimators_:
        t = estimator.tree_
        trees.append({
            "feature":        t.feature.tolist(),
            "threshold":      t.threshold.tolist(),
            "children_left":  t.children_left.tolist(),
            "children_right": t.children_right.tolist(),
            # value shape is (n_nodes, n_outputs, n_classes) — squeeze n_outputs
            "value":          t.value[:, 0, :].astype(int).tolist(),
        })
    return {
        "type":          "random_forest",
        "feature_names": FEATURE_NAMES,
        "label_names":   LABEL_NAMES,
        "n_trees":       len(trees),
        "trees":         trees,
    }


def export_logistic_regression(clf, scaler: Optional[StandardScaler]) -> dict:
    payload: dict = {
        "type":          "logistic_regression",
        "feature_names": FEATURE_NAMES,
        "label_names":   LABEL_NAMES,
        "coefficients":  clf.coef_.tolist(),   # shape (n_classes, n_features)
        "intercept":     clf.intercept_.tolist(),
    }
    # Embed scaler params so the TS inference engine can un-scale at runtime
    if scaler is not None:
        payload["scaler_mean"] = scaler.mean_.tolist()
        payload["scaler_scale"] = scaler.scale_.tolist()
    return payload


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def macro_f1(report_str: str) -> float:
    """Parse macro avg F1 from sklearn classification_report string."""
    for line in report_str.splitlines():
        if "macro avg" in line:
            parts = line.split()
            try:
                return float(parts[-2])
            except (IndexError, ValueError):
                pass
    return 0.0


def train_and_evaluate(
    X_train: np.ndarray,
    X_test: np.ndarray,
    y_train: np.ndarray,
    y_test: np.ndarray,
) -> tuple[object, object, str, str]:
    """Train RF and LR, print reports, return both models and their report strings."""
    target_names = [f"{n} ({i})" for i, n in enumerate(LABEL_NAMES)]

    # -- Random Forest -------------------------------------------------------
    print("\n-- Random Forest ---------------------------------------------")
    rf = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, class_weight='balanced')
    rf.fit(X_train, y_train)
    y_pred_rf = rf.predict(X_test)
    rf_report = classification_report(y_test, y_pred_rf, target_names=target_names, zero_division=0)
    print(rf_report)
    print("Confusion matrix:")
    print(confusion_matrix(y_test, y_pred_rf))

    # -- Logistic Regression -------------------------------------------------
    print("\n-- Logistic Regression ---------------------------------------")
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled  = scaler.transform(X_test)
    lr = LogisticRegression(max_iter=1000, random_state=42, class_weight='balanced')
    lr.fit(X_train_scaled, y_train)
    y_pred_lr = lr.predict(X_test_scaled)
    lr_report = classification_report(y_test, y_pred_lr, target_names=target_names, zero_division=0)
    print(lr_report)
    print("Confusion matrix:")
    print(confusion_matrix(y_test, y_pred_lr))

    return rf, (lr, scaler), rf_report, lr_report


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train model router classifier")
    parser.add_argument(
        "--input-dir", type=Path, default=DEFAULT_INPUT_DIR,
        help="Directory containing router-full-extracted.jsonl and router-full-judged.jsonl",
    )
    parser.add_argument(
        "--output-path", type=Path, default=DEFAULT_OUTPUT_PATH,
        help="Path for the output router-weights.json file",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_dir: Path = args.input_dir
    output_path: Path = args.output_path

    records = load_and_join(input_dir)
    X, y   = prepare_dataset(records)

    print("\n-- Train / test split (80/20 stratified) ---------------------")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"  Train : {len(X_train)} samples")
    print(f"  Test  : {len(X_test)} samples")

    rf, lr_bundle, rf_report, lr_report = train_and_evaluate(
        X_train, X_test, y_train, y_test
    )
    lr, scaler = lr_bundle

    rf_f1 = macro_f1(rf_report)
    lr_f1 = macro_f1(lr_report)

    print("\n-- Model selection -------------------------------------------")
    print(f"  Random Forest macro F1     : {rf_f1:.4f}")
    print(f"  Logistic Regression macro F1 : {lr_f1:.4f}")

    if rf_f1 >= lr_f1:
        winner_name = "Random Forest"
        payload = export_random_forest(rf)
        reason = (
            f"Random Forest (macro F1 {rf_f1:.4f}) >= "
            f"Logistic Regression ({lr_f1:.4f})"
        )
    else:
        winner_name = "Logistic Regression"
        payload = export_logistic_regression(lr, scaler)
        reason = (
            f"Logistic Regression (macro F1 {lr_f1:.4f}) > "
            f"Random Forest ({rf_f1:.4f})"
        )

    print(f"  Selected : {winner_name}")
    print(f"  Reason   : {reason}")

    # -- Export --------------------------------------------------------------
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)

    print("\n-- Export ----------------------------------------------------")
    print(f"  Written to : {output_path}")
    print(f"  Model type : {payload['type']}")
    if payload["type"] == "random_forest":
        print(f"  Trees      : {payload['n_trees']}")
    else:
        n_feat = len(payload["coefficients"][0]) if payload["coefficients"] else 0
        print(f"  Features   : {n_feat}")
    print("\nDone.")


if __name__ == "__main__":
    main()
