import { runInAction, makeAutoObservable } from "mobx"
import { observer } from "mobx-react-lite";
import { Control, EndPointControl, Path, Spline, Vertex } from '../math/path';
import { CanvasConfig } from '../math/shape';
import Konva from 'konva';
import { Circle, Line } from 'react-konva';
import { useState } from "react";
import { AppProps } from "../App";
import { SplineControlElement } from "./SplineControlElement";
import { SplineControlVisualLineElement } from "./SplineControlVisualLineElement";
import { SplineKnotsHitBoxElement } from "./SplineKnotsHitBoxElement";


export interface SplineElementProps extends AppProps {
  spline: Spline;
  path: Path;
}

export function SplineElement(props: SplineElementProps) {
  const isFirstSpline = props.path.splines[0] === props.spline;

  const knotRadius = props.cc.pixelWidth / 320;

  return (
    <>
      {props.spline.calculateKnots(props.cc).map((knotInCm, index) => {
        let knotInPx = props.cc.toPx(knotInCm);
        return (
          <Circle key={index} x={knotInPx.x} y={knotInPx.y} radius={knotRadius} fill="#00ff00ff" />
        )
      })}
      {
        props.spline.controls.length === 4 ? (
          <>
            {props.spline.controls[1].visible ? <SplineControlVisualLineElement start={props.spline.controls[0]} end={props.spline.controls[1]} cc={props.cc} /> : null}
            {props.spline.controls[2].visible ? <SplineControlVisualLineElement start={props.spline.controls[2]} end={props.spline.controls[3]} cc={props.cc} /> : null}
          </>
        ) : null
      }
      <SplineKnotsHitBoxElement {...props} />
      {props.spline.controls.map((cpInCm, cpIdx) => {
        if (!isFirstSpline && cpIdx === 0) return null;
        if (!cpInCm.visible) return null;
        return (
          <SplineControlElement key={cpIdx} {...props} cp={cpInCm} />
        )
      })}
    </>
  )
}
