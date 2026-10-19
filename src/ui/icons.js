// Icone a tratto (Lucide, licenza ISC) utilizzabili sia nel DOM (SVG) sia sui pannelli canvas in VR.
import {
  MousePointer2, Cable, Gauge, Trash, Undo2, Redo2, Save, FolderOpen, FilePlus, FileText, Settings, Glasses,
  Box, Zap, Power, Plug, Lightbulb, ToggleRight, Activity, CircleCheck, TriangleAlert, OctagonX, Info, Eye,
  Camera, LayoutGrid, ListChecks, BookOpen, GraduationCap, Presentation, Play, Pause, FastForward, Sun, Moon,
  SlidersHorizontal, X, ChevronDown, ChevronRight, ChevronLeft, Search, Maximize, Hand, Move, RotateCcw, Cpu,
  CircleDot, Volume2, VolumeX, ShieldCheck, UserRound, Printer, Download, Upload, GripVertical, PlugZap,
  Unplug, ScanEye, Rotate3d, Orbit, Ruler, Rabbit, Snail, Fan, Bell, Timer, House, Factory, CircuitBoard,
  PanelLeft, PanelRight, CircleX, Keyboard, Mouse, Crosshair, Flag, Lock, LockOpen, CircleQuestionMark, Pointer,
  WavesHorizontal, Check, Plus, Minus, Wrench, Footprints, RefreshCw, ArrowLeft, ArrowRight, Sparkles,
} from 'lucide';

export const ICONS = {
  select: MousePointer2, wire: Cable, measure: Gauge, trash: Trash, undo: Undo2, redo: Redo2, save: Save,
  open: FolderOpen, new: FilePlus, report: FileText, settings: Settings, vr: Glasses, box: Box, zap: Zap,
  power: Power, plug: Plug, lamp: Lightbulb, toggle: ToggleRight, activity: Activity, ok: CircleCheck,
  warn: TriangleAlert, error: OctagonX, info: Info, eye: Eye, camera: Camera, grid: LayoutGrid,
  checks: ListChecks, book: BookOpen, school: GraduationCap, present: Presentation, play: Play, pause: Pause,
  fast: FastForward, sun: Sun, moon: Moon, sliders: SlidersHorizontal, close: X, down: ChevronDown,
  right: ChevronRight, left: ChevronLeft, search: Search, maximize: Maximize, hand: Hand, move: Move,
  reset: RotateCcw, cpu: Cpu, dot: CircleDot, sound: Volume2, mute: VolumeX, shield: ShieldCheck,
  user: UserRound, print: Printer, download: Download, upload: Upload, grip: GripVertical, plugzap: PlugZap,
  unplug: Unplug, scan: ScanEye, rotate3d: Rotate3d, orbit: Orbit, ruler: Ruler, rabbit: Rabbit, snail: Snail,
  fan: Fan, bell: Bell, timer: Timer, house: House, factory: Factory, board: CircuitBoard,
  panelLeft: PanelLeft, panelRight: PanelRight, circleX: CircleX, keyboard: Keyboard, mouse: Mouse,
  crosshair: Crosshair, flag: Flag, lock: Lock, unlock: LockOpen, help: CircleQuestionMark, pointer: Pointer,
  waves: WavesHorizontal, check: Check, plus: Plus, minus: Minus, wrench: Wrench, walk: Footprints,
  refresh: RefreshCw, back: ArrowLeft, next: ArrowRight, sparkles: Sparkles,
};

const esc = (v) => String(v).replace(/"/g, '&quot;');

/** Markup SVG di un'icona */
export function iconSVG(name, { size = 18, stroke = 1.75, cls = '' } = {}) {
  const node = ICONS[name];
  if (!node) return '';
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('');
  return `<svg class="ico ${cls}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

const pathCache = new Map();
function toPaths(name) {
  if (pathCache.has(name)) return pathCache.get(name);
  const node = ICONS[name] || [];
  const out = [];
  for (const [tag, a] of node) {
    const p = new Path2D();
    if (tag === 'path') p.addPath(new Path2D(a.d));
    else if (tag === 'circle') p.arc(+a.cx, +a.cy, +a.r, 0, Math.PI * 2);
    else if (tag === 'ellipse') p.ellipse(+a.cx, +a.cy, +a.rx, +a.ry, 0, 0, Math.PI * 2);
    else if (tag === 'line') {
      p.moveTo(+a.x1, +a.y1);
      p.lineTo(+a.x2, +a.y2);
    } else if (tag === 'rect') {
      const r = +(a.rx || 0);
      if (p.roundRect) p.roundRect(+(a.x || 0), +(a.y || 0), +a.width, +a.height, r);
      else p.rect(+(a.x || 0), +(a.y || 0), +a.width, +a.height);
    } else if (tag === 'polyline' || tag === 'polygon') {
      const pts = String(a.points).trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i < pts.length; i += 2) (i ? p.lineTo : p.moveTo).call(p, pts[i], pts[i + 1]);
      if (tag === 'polygon') p.closePath();
    }
    out.push(p);
  }
  pathCache.set(name, out);
  return out;
}

/** Disegna un'icona su un contesto 2D (pannelli VR, lavagna LIM) */
export function drawIcon(ctx, name, x, y, size, color = '#fff', stroke = 2) {
  const paths = toPaths(name);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of paths) ctx.stroke(p);
  ctx.restore();
}
