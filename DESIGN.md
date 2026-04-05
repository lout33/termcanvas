# Design System: Canvas Learning
**Project ID:** local-canvas-desktop

## 1. Visual Theme & Atmosphere

Canvas Learning should feel like a **nocturnal operator's desk for spatial shell work**. The atmosphere is **quiet, technical, and intentionally restrained**: closer to a premium terminal cockpit than a note-taking app, whiteboard, or generic productivity dashboard.

The aesthetic direction is **dark, layered, and low-glare**. Visual weight should stay concentrated in the live terminal surfaces, while supporting UI such as drawers, hints, and inspectors recede into soft translucent shells. The interface should reward long sessions by feeling calm under sustained use rather than loud on first impression.

**Key characteristics:**
- **Terminal-first focus:** the terminal nodes are the primary object in the system, not secondary widgets
- **Spatial clarity:** canvas objects should feel placed in a navigable field, not stacked in an ordinary window layout
- **Quiet chrome:** supporting controls should be present and precise, but never dominate the board
- **Dense utility, low noise:** every surface earns its place; avoid decorative filler and novelty gradients
- **Soft depth, hard function:** the UI can feel polished, but interaction affordances must stay obvious and reliable

## 2. Color Palette & Roles

### Board Foundation
- **Graphite Board Field** (`#17191D`) – Primary board color. Used for the main working surface so terminal windows read clearly without the board feeling pitch-black.
- **Deep Charcoal Void** (`#14161A`) – Secondary board depth. Used in gradients, corners, and low-light transitions to give the canvas a grounded nighttime atmosphere.
- **Faint Board Glow** (`rgba(255, 255, 255, 0.03)`) – Ambient top-left bloom. Used sparingly to stop the board from feeling flat.

### Drawer & Panel Surfaces
- **Midnight Glass** (`rgba(11, 15, 22, 0.90)`) – Base tone for the left drawer family. Used for sidebar identity and layered shells.
- **Dense Slate Glass** (`rgba(17, 22, 31, 0.96)`) – Stronger overlay tone. Used where panel surfaces need more authority.
- **Panel Film** (`rgba(255, 255, 255, 0.03)`) – Default panel fill for list rows, action chips, and passive controls.
- **Panel Hover Mist** (`rgba(255, 255, 255, 0.055)`) – Hover response for drawer list items and secondary buttons.
- **Panel Active Blue Wash** (`rgba(116, 150, 255, 0.12)`) – Active/selected row state. Used to mark the current canvas, folder, or file without overpowering the scene.

### Terminal Surfaces
- **Terminal Ink Black** (`rgba(9, 10, 12, 0.98)`) – Shell-level container tone around terminal content.
- **Terminal Surface Night** (`rgba(7, 8, 10, 0.99)`) – Actual terminal bed. Used behind xterm content for strong contrast and minimal glare.
- **Terminal Rule Smoke** (`rgba(255, 255, 255, 0.06)`) – Hairline dividers inside terminal chrome.

### Accent & Interaction
- **Electric Periwinkle** (`rgba(116, 150, 255, 0.34)`) – Primary interaction accent. Used for selected states, resize affordances, focus accents, and reopen actions.
- **Cold Blue Glow** (`rgba(125, 168, 255, 0.34)`) – Diffused emphasis for active handles and micro-glows.
- **Soft Signal White** (`#EEF2FF`) – Primary high-contrast foreground. Used for titles and key readable text.
- **Muted Steel Copy** (`#9AA7BC`) – Default secondary copy. Used for metadata, hints, and supporting explanation.

### Semantic Feedback
- **Recoverable Rose** (`rgba(248, 113, 113, 0.92)`) – Critical and destructive emphasis. Used for close actions, exited-terminal states, and error labels.
- **Exited Shell Wash** (`rgba(127, 29, 29, 0.18)`) – Subtle background for exited terminal badges.

## 3. Typography Rules

**Primary UI Sans:** Avenir Next / Helvetica Neue / system sans  
**Role:** Structural reading font for drawers, empty states, and general UI copy. It should feel neutral and contemporary, never brand-heavy.

**Primary UI Mono:** SFMono-Regular / Menlo / Monaco / Consolas / monospace  
**Role:** Operational font for hints, controls, metadata, status chips, inspector labels, and terminal-adjacent chrome. The monospace face is part of the product identity and should appear throughout the shell.

**Display Serif:** Iowan Old Style / Baskerville / serif  
**Role:** Reserved and optional. If used at all, it should appear only in rare high-level editorial moments, never in core workflow chrome.

### Hierarchy & Weight
- **Board and empty-state headings:** Semi-bold sans (600), modest letter-spacing, direct and compact
- **Drawer section labels:** Mono, uppercase, tight size (`~0.68rem`), expanded tracking for utility labeling
- **Terminal titles:** Mono, medium-to-semi-bold, compact and crisp
- **Metadata and badges:** Mono, uppercase, small, lightly tracked for machine-like readability
- **Body/supporting copy:** Sans, regular weight, moderate line-height, plainspoken tone

### Tone Rules
- Use **short labels over explanatory prose** inside chrome
- Prefer **mono for status and navigation scaffolding**, sans for human-facing explanations
- Keep text density controlled; the board should never read like a document editor

## 4. Component Stylings

### Buttons
- **Shape:** Small-radius or pill-shaped depending on role. Utility actions can feel compact; workflow toggles should feel grip-friendly.
- **Primary behavior:** Soft translucent shells with stronger borders on hover rather than loud fills.
- **Accent usage:** Reserve stronger blue emphasis for active, selected, or recovery-oriented actions rather than every clickable item.
- **Focus treatment:** Clear outer ring or glow using the cool blue accent family; keyboard focus must remain unmistakable on dark surfaces.

### Left Drawer
- **Character:** A translucent equipment panel, not a sidebar from a typical SaaS app.
- **Shape:** Generously rounded outer shell with quieter inner list rows.
- **Depth:** Medium shadow with blur; enough separation from the board to feel layered but not floating theatrically.
- **Behavior:** The drawer may overlay the board, but it should still feel like part of the canvas environment.

### Right Inspector
- **Character:** A focused reading console for the selected file.
- **Visual relationship:** It should look like a sibling to the left drawer, not an unrelated panel system.
- **Header:** Clear document identity at the top with light metadata and compact actions.
- **Body:** Comfortable scrolling, high-contrast code/text rendering, and minimal ornament.

### Terminal Nodes
- **Shape:** Subtly rounded rectangles with a tight, precise silhouette.
- **Shell:** Dark hardware-like enclosure with a lighter header seam and a deeper content bed.
- **Active state:** Border and shadow intensify slightly; avoid neon outlines or oversized glow.
- **Maximized state:** The node becomes a near-full-board workstation, preserving the same material language while increasing authority.
- **Exited state:** Desaturate and dim terminal content rather than replacing it with a generic error panel.

### Workspace Rows & Canvas Rows
- **Default state:** Flat, translucent, low-contrast containers.
- **Hover state:** Slightly brighter panel wash and border lift.
- **Selected state:** Blue-tinted active wash with a sense of precise targeting, not a chunky filled block.

### Hints, HUDs, and Overlays
- **Hint chips:** Low-priority, pill-shaped, mono-labeled utility capsules.
- **Zoom indicator:** Compact mono instrument label rather than a decorative badge.
- **Terminal overlays:** Frosted emergency layer over the shell, centered, concise, and operational.

## 5. Layout Principles

### Core Spatial Model
- The board is the primary workspace and should visually own the application.
- Side panels are **edge instruments**, not the main event.
- Terminal nodes should feel like movable workstations distributed across a large field.

### Edge Framing
- Use consistent outer offsets (`~0.75rem` to `1rem`) so drawers, HUDs, and maximized terminals align to a shared frame.
- Preserve generous negative space around board HUD elements so the canvas still feels open.

### Density Strategy
- Keep chrome dense and efficient near edges.
- Keep the center of the board visually quieter.
- Make file lists and inspectors information-rich, but never let them become visually heavier than the terminal nodes.

### Corner Language
- Outer application shells: softly rounded and premium
- List rows and inputs: smaller, restrained rounding
- Status chips and micro-controls: pill-like when they need to read as instruments

### Responsive Behavior
- On smaller screens, drawers can become more dominant in width, but they should preserve the same visual language.
- Resizable panels should clamp safely inside the viewport and never make the app feel broken or clipped.
- Terminal readability wins over decorative spacing when space becomes limited.

## 6. Depth, Shadow & Material Rules

- Prefer **diffused, low-spread shadows** over hard drop shadows.
- Use blur and translucent layering to imply glass and equipment housing.
- Avoid flat monochrome slabs with no depth cues.
- Avoid bright glossy highlights, saturated gradients, or game-like neon treatment.
- Layer hierarchy should read clearly:
  1. Board field
  2. Drawer and inspector shells
  3. Terminal nodes
  4. Temporary overlays, fullscreen controls, and active handles

## 7. Interaction & Motion Principles

- Motion should feel **instrumental and frictionless**, not playful.
- Use short fades and slight positional shifts for reveal/hide states.
- Dragging and resizing should feel physically direct: no elastic overshoot, no theatrical easing.
- Hover states should brighten or sharpen, not jump.
- Resize handles and panel rails should remain understated until needed, then become obvious on hover/active.

## 8. Anti-Goals

Do not let future screens drift into:
- generic AI dashboard aesthetics
- bright productivity-app pastel palettes
- oversized marketing typography
- decorative illustrations or mascot-driven UI
- heavy glassmorphism that hurts terminal readability
- consumer note-app softness that weakens the terminal-first identity

## 9. Design Direction For Future Iteration

When extending this app, use prompts and language like:

- "Design a dark terminal-first spatial workspace with quiet premium chrome and low-glare translucent side instruments."
- "Keep the board open and atmospheric, while terminal nodes feel like precise movable workstations."
- "Use cool blue interaction accents sparingly for focus, selection, and resize affordances only."
- "Preserve mono-labeled utility controls and compact, operator-style metadata throughout the shell."

If redesigning the existing UI, prioritize this order:
1. Strengthen the board and terminal hierarchy
2. Make drawer and inspector siblings in the same material family
3. Tighten typography consistency between sans copy and mono control language
4. Improve active, focus, and selected states without making the interface louder
