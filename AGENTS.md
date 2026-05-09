# Ingress OP Sim - Project Guide

## Overview
A web-based planning tool for the game Ingress. Users create portals on a canvas, build links between them, and form fields — tracking agent statistics in real time.

## Tech Stack
- **Framework**: Astro v6 + Svelte 5 (with runes)
- **Styling**: TailwindCSS v4 + DaisyUI v5
- **PWA**: @vite-pwa/astro (auto-update, offline support)
- **Rendering**: HTML5 Canvas for map, DOM for UI panels

## Data Model

### Portal
```ts
interface Portal { id: string; x: number; y: number; label: string }
```

### Agent
```ts
interface Agent { id: string; name: string; linkCount: number; fieldCount: number; ap: number }
```

### Link
```ts
type Link = [sourceId: string, targetId: string, agentId: string]
```

### Field
```ts
type Field = [p1Id: string, p2Id: string, p3Id: string, agentId: string]
```

### GameState
```ts
interface GameState {
  mode: 'portal' | 'link' | 'delete'
  portals: Portal[]
  agents: Agent[]
  selectedAgentId: string | null
  links: Link[]
  fields: Field[]
  pendingLinkPortalId: string | null  // first portal clicked in link mode
}
```

## Tools (ToolBar)

Located at the top of the screen:

| Tool | Icon | Behavior |
|------|------|----------|
| **Portal** | 📍 | Click empty canvas → create portal (auto-named P1, P2, ...) |
| **Link** | 🔗 | 1) Select agent in dropdown → 2) Click portal A → 3) Click portal B → create link |
| **Delete** | 🗑 | Click portal → delete portal + all its links/fields; click link → delete single link |

## Agent Panel

Located on the right side:
- Top bar shows global stats: 📍 portal count, 🔗 link count, ⬡ field count
- "+" button next to global stats to add agents (max 16, auto-named Agent01, Agent02...)
- Click an agent card to select/deselect (highlighted with primary border)

## Ingress Rules (strict enforcement)

1. **No crossing links**: New links are rejected if they would intersect any existing link (except at shared endpoints)
2. **Multi-layer fields**: All possible triangles are detected when a link is added. Multiple overlapping fields are supported (AP awarded for each).
3. **Cascade deletion**: Deleting a portal removes all its links; removing links removes any fields that depended on those links.
4. **AP**: Link = +313 AP, Field = +1250 AP

## File Structure

```
src/
├── stores/
│   └── gameStore.ts        # Global state (writable store) + all actions
├── components/
│   ├── ToolBar.svelte       # Tool selection + agent dropdown + add agent + clear all
│   ├── MapCanvas.svelte     # Canvas rendering + mouse event handling
│   └── AgentPanel.svelte    # Right-side agent list with stats
└── pages/
    └── index.astro          # Layout composition
```

## Layout

```
┌──────────────────────────────────────────────────────┐
│  [📍 Portal] [🔗 Link] [🗑 Delete] | Agent: [▼Sel]│  ← ToolBar
├──────────────────────────────┬───────────────────────┤
│                              │  Agents               │
│                              │  ┌─ Agent 1 ────────┐ │
│       Canvas (Map)           │  │ 🔗 5 ⬡ 2         │ │
│                              │  │ AP: 4,065         │ │
│                              │  └───────────────────┘ │
│                              │  ┌─ Agent 2 ────────┐ │
│                              │  │ 🔗 3 ⬡ 1         │ │
│                              │  │ AP: 2,189         │ │
│                              │  └───────────────────┘ │
│                              │  ...                   │
│                              │  (scroll)              │
└──────────────────────────────┴───────────────────────┘
```

## Key Actions (gameStore.ts)

| Action | Description |
|--------|-------------|
| `setMode(mode)` | Switch tool mode, clear pending link |
| `addAgent(name)` | Add agent (max 16) |
| `selectAgent(id)` | Select/deselect agent |
| `addPortal(x, y)` | Create portal at coordinates |
| `handleCanvasClick(x, y)` | Dispatches to current tool logic |
| `handleLinkClick(portalId)` | Two-click link creation |
| `deletePortal(id)` | Remove portal + cascade delete |
| `deleteLink(index)` | Remove single link + dependent fields |
| `clearAll()` | Reset everything, agent stats to 0 |

## Field Detection (detectNewFields)

After each new link A-B by agent X:
1. Find all portals C connected to both A and B via existing links
2. For each C, check if A-C and B-C links exist
3. If triangle A-B-C is not already recorded, add new Field

## Modification Rules

> **IMPORTANT**: Any code changes must be reflected in this file. Update this guide whenever:
> - Adding/removing components
> - Changing data model types
> - Modifying game rules (AP values, link crossing, field detection)
> - Changing file structure or naming
