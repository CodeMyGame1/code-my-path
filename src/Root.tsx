import "./Root.scss";

import { observer } from "mobx-react-lite";

import { ThemeProvider } from "@mui/material/styles";

import { Box } from "@mui/material";
import {
  getEnableOnAllInputFieldsHotkeysOptions,
  getEnableOnNonTextInputFieldsHotkeysOptions,
  useClipboardPasteText,
  useCustomHotkeys,
  useDragDropFile,
  useUnsavedChangesPrompt,
  useWindowSize
} from "./core/Hook";
import { getAppStores } from "./core/MainApp";

import { onDownload, onDownloadAs, onDropFile, onNew, onOpen, onSave, onSaveAs } from "./core/InputOutput";
import { NoticeProvider } from "./app/Notice";
import { ConfirmationModal } from "./app/common.blocks/modal/ConfirmationModal";
import { DragDropBackdrop } from "./app/common.blocks/DragDropBackdrop";
import { RemovePathsAndEndControls, UpdatePathTreeItems } from "./core/Command";
import React from "react";
import { getUsableLayout } from "./core/Layout";
import { getAppThemeInfo } from "./app/Theme";
import { Layout } from "./app/Layouts";
import { AboutModal } from "./app/common.blocks/modal/AboutModal";
import { WelcomeModal } from "./app/common.blocks/modal/WelcomeModal";
import { PreferencesModal, PreferencesModalSymbol } from "./app/common.blocks/modal/PreferencesModal";
import { AssetManagerModal } from "./app/common.blocks/modal/AssetManagerModal";
import { RequireLocalFieldImageModal } from "./app/common.blocks/modal/RequireLocalFieldImageModal";
import { GeneralConfigPanel } from "./app/common.blocks/panel/GeneralConfigPanel";
import { ControlConfigPanel } from "./app/common.blocks/panel/ControlConfigPanel";
import { CoordinateSystemModal } from "./app/common.blocks/modal/CoordinateSystemModal";
import { CoordinateSystemTransformation } from "./core/CoordinateSystem";
import { parseFormula } from "./core/Util";
import { NumberUOA, NumberUOL } from "./token/Tokens";
import { UnitOfAngle } from "./core/Unit";
import { Coordinate, CoordinateWithHeading } from "./core/Coordinate";

const Root = observer(() => {
  const { app, ui, appPreferences, clipboard } = getAppStores();

  const isUsingEditor = !ui.isOpeningModal;
  const { isDraggingFile, onDragEnter, onDragLeave, onDragOver, onDrop } = useDragDropFile(isUsingEditor, onDropFile);

  const isEnableInputField = isUsingEditor && !isDraggingFile;

  // UX: Enable custom hotkeys on input fields (e.g. Mod+S) to prevent accidentally triggering the browser default
  // hotkeys when focusing them (e.g. Save page). However, we do not apply it to all hotkeys, because we want to keep
  // some browser default hotkeys on input fields (e.g. Mod+Z to undo user input) instead of triggering custom hotkeys
  // (e.g. Mod+Z to undo field change)
  const option1 = getEnableOnAllInputFieldsHotkeysOptions(isEnableInputField);
  const option2 = getEnableOnNonTextInputFieldsHotkeysOptions(isEnableInputField);

  useCustomHotkeys("Mod+P", onNew, option1);
  useCustomHotkeys("Mod+O", onOpen, option1);
  useCustomHotkeys("Mod+S", onSave, option1);
  useCustomHotkeys("Shift+Mod+S", onSaveAs, option1);
  useCustomHotkeys("Mod+D", onDownload, option1);
  useCustomHotkeys("Shift+Mod+D", onDownloadAs, option1);
  useCustomHotkeys("Mod+Comma", () => ui.openModal(PreferencesModalSymbol), option1);
  useCustomHotkeys("Mod+X", () => clipboard.cut(), option2);
  useCustomHotkeys("Mod+C", () => clipboard.copy(), option2);

  useCustomHotkeys("Mod+Z", () => app.history.undo(), option2);
  useCustomHotkeys("Mod+Y,Shift+Mod+Z", () => app.history.redo(), option2);
  useCustomHotkeys("Mod+A", () => app.onSelectAll(), option2);
  useCustomHotkeys("Esc", () => app.clearSelected(), option2);
  useCustomHotkeys(
    "Shift+Mod+A",
    () => app.setSelected(app.allEntities.filter(e => !app.selectedEntities.includes(e))),
    option1
  );

  useCustomHotkeys(
    "Mod+B",
    () => (appPreferences.isSpeedCanvasVisible = !appPreferences.isSpeedCanvasVisible),
    option1
  );
  useCustomHotkeys(
    "Mod+J",
    () => (appPreferences.isRightSectionVisible = !appPreferences.isRightSectionVisible),
    option1
  );

  useCustomHotkeys("Mod+Add,Mod+Equal", () => (app.fieldEditor.scale += 0.5), option1);
  useCustomHotkeys("Mod+Subtract,Mod+Minus", () => (app.fieldEditor.scale -= 0.5), option1);
  useCustomHotkeys("Mod+0", () => app.resetFieldOffsetAndScale(), option1);

  useCustomHotkeys("R", () => (app.gc.showRobot = !app.gc.showRobot), option2);

  useCustomHotkeys(
    "Backspace,Delete",
    () => {
      const command = new RemovePathsAndEndControls(app.paths, app.selectedEntityIds);
      app.history.execute(`Remove paths and end controls`, command);
    },
    option2
  );

  useUnsavedChangesPrompt();

  useClipboardPasteText(document.body, (text, e) => {
    // UX: Do not paste if the user is typing in a content editable element
    // e.target is body if the focused element is checkbox, button, etc.

    const coordRegex = /^(-?\d*\.?\d*), ?(-?\d*\.?\d*)(?:, ?(-?\d*\.?\d*))?$/;

    // Genuinely disappointed that Jerrylum forgot this
    e.preventDefault();

    if (e.target instanceof HTMLTextAreaElement) return;
    if (e.target instanceof HTMLElement && e.target.isContentEditable) return;

    // Could be a control panel thing!
    if (e.target instanceof HTMLInputElement) {
      navigator.clipboard.readText().then(text => {
        const matches = text.match(coordRegex);

        if (!matches) {
          return;
        }

        // TODO: Logic obtained from `ControlConfigPanel.tsx` -- abstract into
        // helper function!
        const cst: CoordinateSystemTransformation | undefined = (() => {
          if (app.selectedEntityCount !== 1) return undefined;
          const control = app.selectedControl;
          if (control === undefined) return undefined;

          const referencedPath = app.interestedPath();
          if (referencedPath === undefined) return undefined;

          const cs = app.coordinateSystem;
          if (cs === undefined) return undefined;

          const fieldDimension = app.fieldDimension;

          const firstControl = referencedPath.segments[0].controls[0];

          return new CoordinateSystemTransformation(cs, fieldDimension, firstControl);
        })();

        if (cst === undefined) return;

        const control = app.selectedControl;

        if (control === undefined) return;

        const coordInFCS = cst.transform(control);
        const xValueInFCS = parseFormula(matches[1], NumberUOL.parse)!.compute(app.gc.uol);
        const yValueInFCS = parseFormula(matches[2], NumberUOL.parse)!.compute(app.gc.uol);
        let headingValueInFCS;
        if (matches[3]) {
          console.log(matches[3]);
          headingValueInFCS = parseFormula(matches[3], NumberUOA.parse)!.compute(UnitOfAngle.Degree);
        }

        let newCoordInfo: Coordinate = {
          ...coordInFCS,
          x: xValueInFCS,
          y: yValueInFCS
        };

        let newCoordInfoWithHeading;
        if (headingValueInFCS) {
          newCoordInfoWithHeading = newCoordInfo as CoordinateWithHeading;
          newCoordInfoWithHeading.heading = headingValueInFCS;
        }

        const newCoord = cst.inverseTransform(newCoordInfoWithHeading ?? newCoordInfo);

        app.history.execute(`Update control ${control.uid} coordinate`, new UpdatePathTreeItems([control], newCoord));
      });
      return;
    }

    // Pasting a path.
    clipboard.paste(text);
  });

  const windowSize = useWindowSize();
  const usingLayout = getUsableLayout(windowSize, appPreferences.layoutType);

  React.useEffect(() => app.onUIReady(), [app]);

  React.useEffect(() => {
    if (ui.getAllOverlays().length > 0) return;
    ui.registerOverlay(() => <ConfirmationModal />);
    ui.registerOverlay(() => <PreferencesModal />);
    ui.registerOverlay(() => <WelcomeModal />);
    ui.registerOverlay(() => <AboutModal />);
    ui.registerOverlay(() => <AssetManagerModal />);
    ui.registerOverlay(() => <CoordinateSystemModal />);
    ui.registerOverlay(() => <RequireLocalFieldImageModal />);
    ui.registerPanel(GeneralConfigPanel, 0);
    ui.registerPanel(ControlConfigPanel, 1);
  }, [ui]);

  // XXX: set key so that the component will be reset when format is changed or app.gc.uol is changed
  // The Layout component in charge for rendering all UI component (panels, overlays) based on the given layout types
  return (
    <Box
      tabIndex={-1}
      id="Root-Container"
      data-theme={getAppThemeInfo().styleName}
      data-layout={usingLayout}
      {...{ onDragEnter, onDragOver, onDrop }}
      key={app.format.uid + "-" + app.gc.uol}>
      <ThemeProvider theme={getAppThemeInfo().theme}>
        <NoticeProvider />
        <Layout targetLayout={usingLayout} />
        {isUsingEditor && isDraggingFile && <DragDropBackdrop {...{ onDragEnter, onDragLeave, onDragOver, onDrop }} />}
      </ThemeProvider>
    </Box>
  );
});

export default Root;
