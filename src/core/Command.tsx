import { MainApp, getAppStores } from "./MainApp";
import { InteractiveEntity } from "./Canvas";
import { Logger } from "./Logger";
import { Control, EndPointControl, Keyframe, KeyframePos, Path, Segment, SegmentVariant, Vector } from "./Path";

const logger = Logger("History");

export interface Execution {
  title: string;
  command: CancellableCommand;
  time: number;
  mergeTimeout: number;
}

export class CommandHistory {
  private lastExecution: Execution | undefined = undefined;
  private history: CancellableCommand[] = [];
  private redoHistory: CancellableCommand[] = [];
  private saveStepCounter: number = 0;

  constructor(private app: MainApp) {}

  execute(title: string, command: CancellableCommand, mergeTimeout = 500): void {
    const result = command.execute();
    if (result === false) return;

    const exe = { title, command, time: Date.now(), mergeTimeout };

    if (
      exe.title === this.lastExecution?.title &&
      isMergeable(exe.command) &&
      isMergeable(this.lastExecution.command) &&
      typeof exe.command === typeof this.lastExecution.command &&
      exe.time - this.lastExecution.time < exe.mergeTimeout &&
      this.lastExecution.command.merge(exe.command)
    ) {
      this.lastExecution.time = exe.time;
    } else {
      this.commit();
      this.lastExecution = exe;

      logger.log("EXECUTE", exe.title);
    }

    this.redoHistory = [];
  }

  commit(): void {
    if (this.lastExecution !== undefined) {
      this.history.push(this.lastExecution.command);
      this.saveStepCounter++;
      this.lastExecution = undefined;

      const { appPreferences } = getAppStores();
      if (this.history.length > appPreferences.maxHistory) this.history.shift();
    }
  }

  undo(): void {
    this.commit();
    if (this.history.length > 0) {
      const command = this.history.pop()!;
      command.undo();
      this.redoHistory.push(command);
      this.saveStepCounter--;

      if (isInteractiveEntitiesCommand(command)) this.app.setSelected(command.entities);
    }
    logger.log("UNDO", this.history.length, "->", this.redoHistory.length);
  }

  redo(): void {
    const command = this.redoHistory.pop();
    if (command !== undefined) {
      command.redo();
      this.history.push(command);
      this.saveStepCounter++;

      if (isInteractiveEntitiesCommand(command)) this.app.setSelected(command.entities);
    }
    logger.log("REDO", this.history.length, "<-", this.redoHistory.length);
  }

  clearHistory(): void {
    this.lastExecution = undefined;
    this.history = [];
    this.redoHistory = [];
    this.saveStepCounter = 0;
  }

  save(): void {
    this.commit();
    this.saveStepCounter = 0;
  }

  isModified(): boolean {
    this.commit();
    return this.saveStepCounter !== 0;
  }
}

export interface Command {
  /**
   * Execute the command
   *
   * @returns true if the command was executed, false otherwise (e.g. if the command is not valid or no change is made)
   */
  execute(): void | boolean;
}

export interface MergeableCommand extends Command {
  /**
   * @param command The command to merge with
   * @returns true if the command was merged, false otherwise
   */
  merge(command: MergeableCommand): boolean;
}

export interface CancellableCommand extends Command {
  undo(): void;
  redo(): void;
}

export interface InteractiveEntitiesCommand extends Command {
  // The entities that are affected by this command, highlighted in the canvas when undo/redo
  entities: InteractiveEntity[];
}

export function isMergeable(object: Command): object is MergeableCommand {
  return "merge" in object;
}

export function isInteractiveEntitiesCommand(object: Command): object is InteractiveEntitiesCommand {
  return "entities" in object;
}

/**
 * ALGO: Assume execute() function are called before undo(), redo() and other functions defined in the class
 */

export class UpdateInstancesProperties<TTarget> implements CancellableCommand, MergeableCommand {
  protected changed = false;
  protected previousValue?: Partial<TTarget>[];

  constructor(protected targets: TTarget[], protected newValues: Partial<TTarget>) {}

  execute(): boolean {
    this.previousValue = [];
    for (let i = 0; i < this.targets.length; i++) {
      const { changed, previousValues } = this.updatePropertiesForTarget(this.targets[i], this.newValues);
      this.changed = this.changed || changed;
      this.previousValue.push(previousValues);
    }

    return this.changed;
  }

  undo(): void {
    for (let i = 0; i < this.targets.length; i++) {
      this.updatePropertiesForTarget(this.targets[i], this.previousValue![i]);
    }
    this.previousValue = undefined;
  }

  redo(): void {
    this.execute();
  }

  merge(latest: UpdateInstancesProperties<TTarget>): boolean {
    // ALGO: Assume that the targets are the same and both commands are executed
    for (let i = 0; i < this.targets.length; i++) {
      this.previousValue![i] = {
        ...latest.previousValue![i],
        ...this.previousValue![i]
      };
      this.newValues = { ...this.newValues, ...latest.newValues };
    }
    return true;
  }

  protected updatePropertiesForTarget(
    target: TTarget,
    values: Partial<TTarget>
  ): { changed: boolean; previousValues: Partial<TTarget> } {
    let changed = false;
    const previousValues: Partial<TTarget> = {} as Partial<TTarget>;
    for (const key in values) {
      previousValues[key] = target[key];
      target[key] = values[key]!;
      changed = changed || target[key] !== previousValues[key];
    }

    return { changed, previousValues };
  }
}

export class UpdateProperties<TTarget> extends UpdateInstancesProperties<TTarget> {
  constructor(protected target: TTarget, protected newValues: Partial<TTarget>) {
    super([target], newValues);
  }
}

export class UpdateInteractiveEntities<TTarget extends InteractiveEntity>
  extends UpdateInstancesProperties<TTarget>
  implements InteractiveEntitiesCommand
{
  constructor(protected targets: TTarget[], protected newValues: Partial<TTarget>) {
    super(targets, newValues);
  }

  get entities(): TTarget[] {
    return this.targets.slice();
  }
}

export class AddSegment implements CancellableCommand, InteractiveEntitiesCommand {
  protected _entities: InteractiveEntity[] = [];

  protected forward: boolean = true;
  protected segment?: Segment;

  constructor(protected path: Path, protected end: EndPointControl, protected variant: SegmentVariant) {}

  protected addLine(): void {
    if (this.path.segments.length === 0) {
      this.segment = new Segment(new EndPointControl(0, 0, 0), [], this.end);
      this._entities.push(this.end);
    } else {
      const last = this.path.segments[this.path.segments.length - 1];
      this.segment = new Segment(last.last, [], this.end);
      this._entities.push(this.end);
    }
    this.path.segments.push(this.segment);
  }

  protected addCurve(): void {
    const p3 = this.end;

    if (this.path.segments.length === 0) {
      const p0 = new EndPointControl(0, 0, 0);
      const p1 = new Control(p0.x, p3.y);
      const p2 = new Control(p3.x, p0.y);
      this.segment = new Segment(p0, [p1, p2], p3);
      this._entities.push(p0, p1, p2, p3);
    } else {
      const last = this.path.segments[this.path.segments.length - 1];
      const p0 = last.last;
      const c = last.controls.length < 4 ? last.controls[0] : last.controls[2];
      const p1 = p0.mirror(new Control(c.x, c.y));
      const p2 = p0.divide(new Control(2, 2)).add(p3.divide(new Control(2, 2)));

      this.segment = new Segment(p0, [p1, p2], p3);
      this._entities.push(p1, p2, p3);
    }
    this.path.segments.push(this.segment);
  }

  execute(): void {
    if (this.variant === SegmentVariant.LINEAR) {
      this.addLine();
    } else if (this.variant === SegmentVariant.CUBIC) {
      this.addCurve();
    }
    this.forward = true;
  }

  undo(): void {
    this.path.segments.pop();
    this.forward = false;
  }

  redo(): void {
    // this.execute();
    // ALGO: Instead of executing, we just add the segment back
    // ALGO: Assume that the command is executed
    this.path.segments.push(this.segment!);
    this.forward = true;
  }

  get entities(): InteractiveEntity[] {
    return this.forward ? this._entities : [];
  }
}

export class ConvertSegment implements CancellableCommand, InteractiveEntitiesCommand {
  protected previousControls: Control[] = [];
  protected newControls: Control[] = [];

  constructor(protected path: Path, protected segment: Segment, protected variant: SegmentVariant) {}

  protected convertToLine(): void {
    this.segment.controls.splice(1, this.segment.controls.length - 2);
  }

  protected convertToCurve(): void {
    let index = this.path.segments.indexOf(this.segment);
    let found = index !== -1;
    if (!found) return;

    let prev: Segment | null = null;
    if (index > 0) {
      prev = this.path.segments[index - 1];
    }

    let next: Segment | null = null;
    if (index + 1 < this.path.segments.length) {
      next = this.path.segments[index + 1];
    }

    let p0 = this.segment.first;
    let p3 = this.segment.last;

    let p1: Control;
    if (prev !== null) {
      p1 = p0.mirror(prev.controls[prev.controls.length - 2]);
      // ensure is a control point (not an end point)
      p1 = new Control(p1.x, p1.y);
    } else {
      p1 = p0.divide(new Control(2, 2)).add(p3.divide(new Control(2, 2)));
    }

    let p2: Control;
    if (next !== null) {
      p2 = p3.mirror(next.controls[1]);
      // ensure is a control point (not an end point)
      p2 = new Control(p2.x, p2.y);
    } else {
      p2 = p0.divide(new Control(2, 2)).add(p3.divide(new Control(2, 2)));
    }

    this.segment.controls = [p0, p1, p2, p3];
  }

  execute(): void {
    this.previousControls = this.segment.controls.slice();
    if (this.variant === SegmentVariant.LINEAR) {
      this.convertToLine();
    } else if (this.variant === SegmentVariant.CUBIC) {
      this.convertToCurve();
    }
    this.newControls = this.segment.controls.slice();
  }

  undo(): void {
    this.segment.controls = this.previousControls.slice();
  }

  redo(): void {
    this.segment.controls = this.newControls.slice();
  }

  get entities(): InteractiveEntity[] {
    return this.segment.controls.slice(1, -1); // exclude first and last
  }
}

export class SplitSegment implements CancellableCommand, InteractiveEntitiesCommand {
  protected _entities: InteractiveEntity[] = [];

  protected forward: boolean = true;

  protected previousOriginalSegmentControls: Control[] = [];
  protected newOriginalSegmentControls: Control[] = [];
  protected newSegment?: Segment;

  constructor(protected path: Path, protected originalSegment: Segment, protected point: EndPointControl) {}

  execute(): void {
    this.previousOriginalSegmentControls = this.originalSegment.controls.slice();

    const index = this.path.segments.indexOf(this.originalSegment);
    const found = index !== -1;
    if (!found) return;

    const cp_count = this.originalSegment.controls.length;
    if (cp_count === 2) {
      const last = this.originalSegment.last;
      this.originalSegment.last = this.point;
      this.newSegment = new Segment(this.point, [], last);
      this.path.segments.splice(index + 1, 0, this.newSegment);

      this._entities = [this.point];
    } else if (cp_count === 4) {
      const p0 = this.originalSegment.controls[0] as EndPointControl;
      const p1 = this.originalSegment.controls[1];
      const p2 = this.originalSegment.controls[2];
      const p3 = this.originalSegment.controls[3] as EndPointControl;

      const a = p1.divide(new Control(2, 2)).add(this.point.divide(new Control(2, 2)));
      const b = this.point;
      const c = p2.divide(new Control(2, 2)).add(this.point.divide(new Control(2, 2)));
      this.originalSegment.controls = [p0, p1, a, b];
      this.newSegment = new Segment(b, [c, p2], p3);
      this.path.segments.splice(index + 1, 0, this.newSegment);

      this._entities = [a, this.point, c];
    }

    this.newOriginalSegmentControls = this.originalSegment.controls.slice();
    this.forward = true;
  }

  undo(): void {
    this.originalSegment.controls = this.previousOriginalSegmentControls;
    const index = this.path.segments.indexOf(this.newSegment!);
    this.path.segments.splice(index, 1);

    this.forward = false;
  }

  redo(): void {
    // this.execute();
    // ALGO: Instead of executing, we just add the segment back
    // ALGO: Assume that the command is executed
    const index = this.path.segments.indexOf(this.originalSegment);
    this.originalSegment.controls = this.newOriginalSegmentControls.slice();
    this.path.segments.splice(index + 1, 0, this.newSegment!);

    this.forward = true;
  }

  get entities(): InteractiveEntity[] {
    return this.forward ? this._entities : [];
  }
}

export class DragControls implements CancellableCommand, MergeableCommand, InteractiveEntitiesCommand {
  constructor(protected main: Control, protected from: Vector, protected to: Vector, protected followers: Control[]) {}

  execute(): void {
    const offsetX = this.to.x - this.from.x;
    const offsetY = this.to.y - this.from.y;
    for (let cp of this.followers) {
      cp.x += offsetX;
      cp.y += offsetY;
    }

    this.main.setXY(this.to);
  }

  undo() {
    const offsetX = this.from.x - this.to.x;
    const offsetY = this.from.y - this.to.y;
    for (let cp of this.followers) {
      cp.x += offsetX;
      cp.y += offsetY;
    }

    this.main.setXY(this.from);
  }

  redo() {
    this.execute();
  }

  merge(command: DragControls): boolean {
    // check if followers are the same
    if (this.followers.length !== command.followers.length) return false;

    for (let i = 0; i < this.followers.length; i++) {
      if (this.followers[i] !== command.followers[i]) return false;
    }

    // check if main is the same
    if (this.main !== command.main) return false;

    this.to = command.to;

    return true;
  }

  get entities(): InteractiveEntity[] {
    return [this.main, ...this.followers];
  }
}

export class AddKeyframe implements CancellableCommand {
  protected kf?: Keyframe;

  constructor(protected path: Path, protected pos: KeyframePos) {}

  execute(): void {
    // sort and push
    this.kf = new Keyframe(this.pos.xPos, this.pos.yPos);
    this.pos.segment.speedProfiles.push(this.kf);
    this.pos.segment.speedProfiles.sort((a, b) => a.xPos - b.xPos);
  }

  undo(): void {
    this.pos.segment.speedProfiles.splice(this.pos.segment.speedProfiles.indexOf(this.kf!), 1);
  }

  redo(): void {
    // this.execute();
    // ALGO: Instead of executing, we just add the keyframe back
    // ALGO: Assume that the command is executed
    this.pos.segment.speedProfiles.push(this.kf!);
    this.pos.segment.speedProfiles.sort((a, b) => a.xPos - b.xPos);
  }

  get keyframe(): Keyframe {
    return this.kf!;
  }
}

export class MoveKeyframe implements CancellableCommand, MergeableCommand {
  protected oldPos?: KeyframePos;

  constructor(protected path: Path, protected newPos: KeyframePos, protected kf: Keyframe) {}

  removeKeyframe(pos: KeyframePos) {
    const idx = pos.segment.speedProfiles.indexOf(this.kf);
    if (idx === -1) return;

    pos.segment.speedProfiles.splice(idx, 1);
  }

  addKeyframe(pos: KeyframePos) {
    this.kf.xPos = pos.xPos;
    this.kf.yPos = pos.yPos;
    pos.segment.speedProfiles.push(this.kf);
    pos.segment.speedProfiles.sort((a, b) => a.xPos - b.xPos);
  }

  execute(): void {
    // remove keyframe from oldSegment speed control
    for (const segment of this.path.segments) {
      const idx = segment.speedProfiles.indexOf(this.kf);
      if (idx === -1) continue;

      segment.speedProfiles.splice(idx, 1);
      this.oldPos = { segment, xPos: this.kf.xPos, yPos: this.kf.yPos };
      break;
    }
    this.addKeyframe(this.newPos);
  }

  undo(): void {
    if (!this.oldPos) return;

    this.removeKeyframe(this.newPos);
    this.addKeyframe(this.oldPos);
  }

  redo(): void {
    // this.execute();
    // ALGO: Instead of executing, we just add the keyframe back
    // ALGO: Assume that the command is executed
    if (!this.oldPos) return;

    this.removeKeyframe(this.oldPos);
    this.addKeyframe(this.newPos);
  }

  merge(command: MoveKeyframe) {
    if (command.kf !== this.kf) return false;

    this.newPos = command.newPos;

    return true;
  }
}

export class RemoveKeyframe implements CancellableCommand {
  protected segment?: Segment;
  protected oldIdx = -1;

  constructor(protected path: Path, protected kf: Keyframe) {}

  execute(): void {
    for (const segment of this.path.segments) {
      const idx = segment.speedProfiles.indexOf(this.kf);
      if (idx === -1) continue;

      segment.speedProfiles.splice(idx, 1);
      this.segment = segment;
      this.oldIdx = idx;
      break;
    }
  }

  undo(): void {
    if (this.segment === undefined || this.oldIdx === -1) return;

    this.segment.speedProfiles.splice(this.oldIdx, 0, this.kf);
  }

  redo(): void {
    // this.execute();
    // ALGO: Instead of executing, we just remove the keyframe
    // ALGO: Assume that the command is executed
    if (this.segment === undefined || this.oldIdx === -1) return;

    this.segment.speedProfiles.splice(this.oldIdx, 1);
  }
}

export class AddPath implements CancellableCommand, InteractiveEntitiesCommand {
  protected forward: boolean = false;

  constructor(protected paths: Path[], protected path: Path) {}

  execute(): void {
    this.paths.push(this.path);
    this.forward = true;
  }

  undo(): void {
    this.paths.splice(this.paths.indexOf(this.path), 1);
    this.forward = false;
  }

  redo(): void {
    this.paths.push(this.path);
    this.forward = true;
  }

  get entities(): InteractiveEntity[] {
    return this.forward ? [this.path, ...this.path.controls] : [];
  }
}

export class RemovePathsAndEndControls implements CancellableCommand, InteractiveEntitiesCommand {
  protected _entities: InteractiveEntity[] = [];

  protected forward: boolean = true;
  protected removalPaths: Path[] = [];
  protected removalEndControls: { path: Path; control: EndPointControl }[] = [];
  protected affectedPaths: { index: number; path: Path }[] = [];
  protected affectedSegments: {
    index: number;
    segment: Segment;
    path: Path;
    linkNeeded: boolean;
  }[] = [];

  /**
   * Remove paths and end controls in the entities list
   * @param paths all paths in the editor
   * @param entities entities to remove
   */
  constructor(protected paths: Path[], entities: (string | InteractiveEntity)[]) {
    // ALGO: Create a set of all entity uids
    const allEntities = new Set(entities.map(e => (typeof e === "string" ? e : e.uid)));

    // ALGO: Loop through all paths, add the path and end controls to the removal list if they are in the entity list
    for (const path of paths) {
      if (allEntities.delete(path.uid)) {
        this.removalPaths.push(path);
      } else {
        // ALGO: Only add the end control if the path is not already in the removal list
        for (const control of path.controls) {
          if (control instanceof EndPointControl && allEntities.delete(control.uid)) {
            this.removalEndControls.push({ path, control });
          }
        }
      }
    }
  }

  protected removePath(path: Path): boolean {
    const idx = this.paths.indexOf(path);
    if (idx === -1) return false;

    this.paths.splice(idx, 1);
    this.affectedPaths.push({ index: idx, path });
    this._entities.push(path, ...path.controls);
    return true;
  }

  protected removeControl(request: { path: Path; control: EndPointControl }): boolean {
    const { path, control } = request;
    for (let index = 0; index < path.segments.length; index++) {
      const segment = path.segments[index];

      const isFirstControlOfSegment = segment.first === control; // pointer comparison
      const isLastSegment = index + 1 === path.segments.length;
      const isLastControlOfLastSegment = isLastSegment && segment.last === control; // pointer comparison

      if ((isFirstControlOfSegment || isLastControlOfLastSegment) === false) continue;

      const isFirstSegment = index === 0;
      const isOnlySegment = path.segments.length === 1;
      const linkNeeded = isFirstControlOfSegment && isFirstSegment === false;

      if (linkNeeded) {
        const prev = path.segments[index - 1];
        prev.last = segment.last; // pointer assignment
      }

      // ALGO: Remove the segment at index i of the path segment list
      path.segments.splice(index, 1);
      this.affectedSegments.push({ index, segment, path, linkNeeded });

      if (isOnlySegment) {
        // ALGO: Define that all controls for the segment disappear
        this._entities.push(...segment.controls);
      } else if (isFirstControlOfSegment) {
        // ALGO: Define that all controls for the segment disappear except for the last one
        this._entities.push(...segment.controls.slice(0, -1));
      } else if (isLastControlOfLastSegment) {
        // ALGO: Define that all controls for the segment disappear except for the first one
        this._entities.push(...segment.controls.slice(1)); // keep the first control
      }
      return true;
    }

    return false;
  }

  execute(): void {
    this.removalPaths.forEach(this.removePath.bind(this));
    this.removalEndControls.forEach(this.removeControl.bind(this));
  }

  undo(): void {
    this.forward = false;

    for (let i = this.affectedPaths.length - 1; i >= 0; i--) {
      const { index, path } = this.affectedPaths[i];
      this.paths.splice(index, 0, path);
    }

    for (let i = this.affectedSegments.length - 1; i >= 0; i--) {
      const { index, segment, path, linkNeeded } = this.affectedSegments[i];
      path.segments.splice(index, 0, segment);

      if (linkNeeded) {
        const prev = path.segments[index - 1];
        prev.last = segment.first; // pointer assignment
      }
    }
  }

  redo(): void {
    this.forward = true;

    for (const { index } of this.affectedPaths) {
      this.paths.splice(index, 1);
    }

    for (const { index, segment, path, linkNeeded } of this.affectedSegments) {
      path.segments.splice(index, 1);

      if (linkNeeded) {
        const prev = path.segments[index - 1];
        prev.last = segment.last; // pointer assignment
      }
    }
  }

  get hasTargets(): boolean {
    return this.removalPaths.length > 0 || this.removalEndControls.length > 0;
  }

  get removedEntities(): InteractiveEntity[] {
    return this._entities;
  }

  get entities(): InteractiveEntity[] {
    return this.forward ? [] : this._entities;
  }
}

export class MoveEndControl implements CancellableCommand, InteractiveEntitiesCommand {
  protected _entities: InteractiveEntity[] = [];

  protected sourceOriginal: { path: Path; segments: Segment[] } | undefined;
  protected destOriginal: { path: Path; segments: Segment[] } | undefined;

  constructor(
    protected paths: Path[],
    protected moving: EndPointControl,
    protected destination: Path | EndPointControl | Control,
    protected order: "before" | "after"
  ) {
    if (this.moving === this.destination) return;

    this.sourceOriginal = this.getSegmentListSnapshot(this.moving);

    if (this.destination instanceof Path) {
      const pathIdx = this.paths.indexOf(this.destination);
      if (pathIdx === -1) return;

      let path: Path;
      if (order === "before" && pathIdx > 0) {
        path = this.paths[pathIdx - 1];
      } else if (order === "after") {
        path = this.paths[pathIdx];
      } else {
        return;
      }
      this.destOriginal = { path, segments: path.segments.slice() };
    } else {
      this.destOriginal = this.getSegmentListSnapshot(this.destination);
    }
  }

  protected removeEndPoint(list: (EndPointControl | Control)[]): void {
    list.splice(list.indexOf(this.moving), 1);
  }

  protected addEndPoint(list: (EndPointControl | Control)[]): void {
    if (this.destination instanceof Path) {
      const idx = this.order === "before" ? list.length : 0;
      list.splice(idx, 0, this.moving);
    } else {
      const idx = list.indexOf(this.destination);
      if (idx === -1) return;
      if (this.order === "before") {
        list.splice(idx, 0, this.moving);
      } else {
        list.splice(idx + 1, 0, this.moving);
      }
    }
  }

  protected constructSegmentList(list: (EndPointControl | Control)[]): Segment[] {
    const segments: Segment[] = [];

    let first: EndPointControl | undefined;
    let middle: Control[] = [];
    let segment: Segment | undefined;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item instanceof EndPointControl) {
        if (first !== undefined) {
          if (middle.length < 2) {
            this._entities.push(...middle);
            middle = []; // No less than 2 controls
          }
          if (middle.length > 2) {
            this._entities.push(...middle.slice(1, -1));
            middle = [middle[0], middle[middle.length - 1]]; // No more than 2 controls
          }
          segments.push((segment = new Segment(first, middle, item)));
        }

        first = item;
        middle = [];
      } else {
        middle.push(item);
      }
    }

    this._entities.push(...middle);
    if (first && segment?.last !== first) this._entities.push(first);

    return segments;
  }

  protected getSegmentListSnapshot(target: EndPointControl | Control): { path: Path; segments: Segment[] } | undefined {
    for (const path of this.paths) {
      const controls = path.controls;
      const idx = controls.indexOf(target);
      if (idx === -1) continue;

      return { path, segments: path.segments.slice() };
    }

    return undefined;
  }

  public execute(): void {
    if (this.sourceOriginal === undefined || this.destOriginal === undefined) return;

    if (this.sourceOriginal.path === this.destOriginal.path) {
      const sourceControls = this.sourceOriginal.path.controls;
      this.removeEndPoint(sourceControls);
      this.addEndPoint(sourceControls);
      this.sourceOriginal.path.segments = this.constructSegmentList(sourceControls);
    } else {
      const sourceControls = this.sourceOriginal.path.controls;
      this.removeEndPoint(sourceControls);
      this.sourceOriginal.path.segments = this.constructSegmentList(sourceControls);

      const destControls = this.destOriginal.path.controls;
      this.addEndPoint(destControls);
      this.destOriginal.path.segments = this.constructSegmentList(destControls);
    }

    this._entities.push(this.moving);
  }

  public undo() {
    if (this.sourceOriginal === undefined || this.destOriginal === undefined) return;

    if (this.sourceOriginal.path === this.destOriginal.path) {
      this.sourceOriginal.path.segments = this.sourceOriginal.segments.slice();
    } else {
      this.sourceOriginal.path.segments = this.sourceOriginal.segments.slice();
      this.destOriginal.path.segments = this.destOriginal.segments.slice();
    }
  }

  public redo() {
    this.execute();
  }

  get isValid(): boolean {
    return this.sourceOriginal !== undefined && this.destOriginal !== undefined;
  }

  get entities(): InteractiveEntity[] {
    return this._entities;
  }
}
