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
  portalSource: 'manual' | 'imported'  // how portals were created
  importedPortalTitles: Map<string, string>  // portal id → IITC title (imported only)
  timelineEntries: TimelineEntry[]  // ordered link creation history
  timelineStep: number              // 0 = initial, entries.length = latest (live)
  isPlaying: boolean                // auto-playback state
  playSpeed: number                 // ms per step (default 500)
}
```

### TimelineEntry
```ts
interface TimelineEntry {
  id: string            // unique id
  srcId: string         // source portal id
  tgtId: string         // target portal id
  agentId: string       // agent who created the link
  fieldsCreated: Field[] // fields detected at creation time
}
```

## Tools (ToolBar)

Located at the top of the screen:

| Tool | Icon | Behavior |
|------|------|----------|
| **Portal** | 📍 | Click empty canvas → create portal (auto-named P1, P2, ...). Disabled when portals are imported. |
| **Link** | 🔗 | 1) Click portal A → 2) Click portal B → create link (uses selected agent) |
| **Delete** | 🗑 | Click portal → delete portal + all its links/fields; click link → delete single link |
| **Import IITC** | 📥 | Import portals from IITC JSON export. Clears existing data. Switches to link mode. |

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
5. **Outbound link limit**: Each portal can have at most 40 outbound links (simulating 4 SBUL mods). Link creation is rejected with an error if either portal has reached this limit.
6. **Outbound link count display**: When a portal's outbound link count exceeds 8, the count is rendered in the portal's center on the canvas. Color is yellow normally, red when at the 40-link maximum.

## File Structure

```
src/
├── stores/
│   └── gameStore.ts        # Global state (writable store) + all actions
├── components/
│   ├── ToolBar.svelte       # Tool selection + clear all
│   ├── MapCanvas.svelte     # Canvas rendering + mouse event handling
│   ├── AgentPanel.svelte    # Right-side agent list with stats
│   └── Timeline.svelte      # Playback timeline + GIF export
├── utils/
│   ├── gifEncoder.ts        # Pure JS GIF89a encoder (LZW + median-cut quantization)
│   └── exportRender.ts      # Offscreen canvas frame renderer for GIF export
└── pages/
    └── index.astro          # Layout composition
```

## Layout

```
┌──────────────────────────────────────────────────────┐
│  [📍 Portal] [🔗 Link] [🗑 Delete]          [Clear]│  ← ToolBar
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
├──────────────────────────────┴───────────────────────┤
│  [⏮] [▶/⏸] [⏭] [speed▾] ──●──●──●──◉──○──○── [5/12]│  ← Timeline
└──────────────────────────────────────────────────────┘
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
| `importIITCPortals(json)` | Import portals from IITC JSON, clear existing data, switch to link mode |
| `getImportedTitle(portalId)` | Returns IITC title for imported portal, or null |
| `exportAgentKeys(agentId)` | Export agent's per-portal key consumption as markdown table, copy to clipboard |
| `findNearbyPortals(x, y, portals, radius)` | Find all portals within larger radius (90px) for hover label display |
| `goToTimelineStep(step)` | Jump to a specific timeline step, rebuild links/fields/agents from history |
| `playTimeline()` | Auto-play timeline forward at configured speed, pauses at end |
| `pauseTimeline()` | Stop auto-playback |
| `setPlaySpeed(ms)` | Set playback interval (125–2000 ms) |

## Field Detection (detectNewFields)

After each new link A-B by agent X:
1. Find all portals C connected to both A and B via existing links
2. For each C, check if A-C and B-C links exist
3. If triangle A-B-C is not already recorded, add new Field

## IITC Portal Import

- **Mutual exclusivity**: Imported and manual portals cannot coexist. Importing clears all existing portals, links, fields, and resets agent stats.
- **Coordinate projection**: Lat/lng → canvas coordinates via linear bounding-box mapping with Y-axis flip. Works with any IITC export regardless of geographic area.
- **Hover labels**: Imported portal labels are hidden by default and shown only when mouse is within ~90px (larger than the 16px click radius).
- **Portal tool disabled**: When portals are imported, the Portal creation tool is disabled and an "Imported" badge is shown in the toolbar.
- **IITC JSON format**: Expects an array of objects with `{ guid, title, coordinates: { lat, lng }, link, image }`.

## GIF Export

- **Location**: Export button (🎞 GIF) in the Timeline bar, next to the step counter
- **Playback speed**: GIF frame delay matches the current timeline `playSpeed` setting
- **Content filtering**: Only portals that have at least one link are rendered in each frame
- **Agent overlay**: A semi-transparent panel in the bottom-right corner shows each active agent's real-time stats (link count, field count, AP)
- **Implementation**: Pure client-side — offscreen canvas renders each frame, median-cut quantization reduces to 256 colors, LZW compression produces GIF89a format
- **Resolution**: 800×600 pixels, auto-fit viewport to linked portals bounding box
- **First frame**: 500ms delay (blank state), subsequent frames use `playSpeed` delay

## Modification Rules

> **IMPORTANT**: Any code changes must be reflected in this file. Update this guide whenever:
> - Adding/removing components
> - Changing data model types
> - Modifying game rules (AP values, link crossing, field detection)
> - Changing file structure or naming
