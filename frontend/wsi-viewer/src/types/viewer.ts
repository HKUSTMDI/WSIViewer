export interface SlideInfo {
  filename: string;
  size_bytes: number | null;
}

export interface MppInfo {
  mpp_x: number | null;
  mpp_y: number | null;
  objective_power: number | null;
}

export type ActiveTool =
  | "pan"
  | "rectangle"
  | "circle"
  | "polygon"
  | "freehand"
  | "eraser"
  | "measure-length"
  | "measure-angle";
