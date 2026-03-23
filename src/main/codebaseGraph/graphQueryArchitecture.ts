/**
 * graphQueryArchitecture.ts — Architecture-view builders extracted from graphQuery.ts.
 * Provides buildModules, buildHotspots, and buildFileTree as standalone functions.
 */

import path from 'path';

import type { GraphStore } from './graphStore';
import type { ArchitectureView, GraphEdge } from './graphTypes';

// ─── Module helpers ──────────────────────────────────────────────────────────

function getModuleName(filePath: string): string {
  const parts = filePath.split('/');
  return parts.length > 1 ? parts[0] + '/' + parts[1] : parts[0];
}

function gatherModuleExports(
  store: GraphStore,
  allEdges: GraphEdge[],
  moduleMap: Map<string, { files: Set<string>; exports: Set<string> }>,
): void {
  for (const edge of allEdges) {
    if (edge.type !== 'exports') continue;
    const targetNode = store.getNode(edge.target);
    if (!targetNode) continue;
    const moduleName = getModuleName(targetNode.filePath);
    moduleMap.get(moduleName)?.exports.add(targetNode.name);
  }
}

// ─── Public builders ─────────────────────────────────────────────────────────

export function buildModules(store: GraphStore): ArchitectureView['modules'] {
  const allNodes = store.getAllNodes();
  const allEdges = store.getAllEdges();
  const moduleMap = new Map<string, { files: Set<string>; exports: Set<string> }>();

  for (const node of allNodes) {
    if (node.type !== 'file') continue;
    const moduleName = getModuleName(node.filePath);
    const mod = moduleMap.get(moduleName) ?? { files: new Set(), exports: new Set() };
    mod.files.add(node.filePath);
    moduleMap.set(moduleName, mod);
  }

  gatherModuleExports(store, allEdges, moduleMap);

  const modules = Array.from(moduleMap.entries()).map(([name, data]) => ({
    name,
    rootPath: name,
    fileCount: data.files.size,
    exports: Array.from(data.exports).slice(0, 20),
  }));
  modules.sort((a, b) => b.fileCount - a.fileCount);
  return modules;
}

export function buildHotspots(store: GraphStore): ArchitectureView['hotspots'] {
  const fileNodes = store.getNodesByType('file');
  const hotspotData = fileNodes.map((node) => {
    const inDegree = store.getEdgesTo(node.id).length;
    const outDegree = store.getEdgesFrom(node.id).length;
    return { filePath: node.filePath, inDegree, outDegree };
  });
  hotspotData.sort((a, b) => b.inDegree + b.outDegree - (a.inDegree + a.outDegree));
  return hotspotData.slice(0, 20);
}

export function buildFileTree(store: GraphStore): ArchitectureView['fileTree'] {
  const allNodes = store.getAllNodes();
  const dirMap = new Map<string, Set<string>>();

  for (const node of allNodes) {
    if (node.type !== 'file') continue;
    const dir = path.dirname(node.filePath);
    const existing = dirMap.get(dir) ?? new Set();
    existing.add(node.filePath);
    dirMap.set(dir, existing);
  }

  const fileTree: ArchitectureView['fileTree'] = [];
  for (const [dir, files] of dirMap) {
    fileTree.push({ path: dir, type: 'directory', children: Array.from(files) });
  }
  fileTree.sort((a, b) => a.path.localeCompare(b.path));
  return fileTree;
}
