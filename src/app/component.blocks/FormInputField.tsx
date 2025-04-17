import { Button, IconButton, InputAdornment, TextField, TextFieldProps, Tooltip } from "@mui/material";
import { action } from "mobx";
import { observer } from "mobx-react-lite";
import { Quantity, UnitConverter, UnitOfLength } from "@core/Unit";
import { clamp } from "@core/Util";
import React, { forwardRef } from "react";
import { AnyControl } from "@src/core/Path";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { CopyCoordsInfo } from "@src/core/Clipboard";

export function clampQuantity(
  value: number,
  uol: UnitOfLength,
  min = new Quantity(-Infinity, UnitOfLength.Centimeter),
  max = new Quantity(+Infinity, UnitOfLength.Centimeter)
): number {
  const minInUOL = new UnitConverter(min.unit, uol).fromAtoB(min.value);
  const maxInUOL = new UnitConverter(max.unit, uol).fromAtoB(max.value);

  return clamp(value, minInUOL, maxInUOL).toUser();
}

export class CoordsCopyInfo {
  /**
   * The control to copy the coords of via `copyCallback`
   */
  public control: AnyControl;
  /**
   * The callback that will presumably copy the x- and y-coordinates in
   * `control` to the clipboard
   */
  public copyCallback: (...args: any[]) => any;
  /**
   * Whether to copy just
   */
  public infoToCopy: CopyCoordsInfo;

  constructor(controlArg: AnyControl, copyCallbackArg: (...args: any[]) => any, infoToCopy: CopyCoordsInfo) {
    this.control = controlArg;
    this.copyCallback = copyCallbackArg;
    this.infoToCopy = infoToCopy;
  }
}

export type FormInputFieldProps = TextFieldProps & {
  getValue: () => string;
  setValue: (value: string, payload: any) => void;
  isValidIntermediate: (candidate: string) => boolean;
  isValidValue: (candidate: string) => boolean | [boolean, any];
  numeric?: boolean; // default false
  copyInfo?: CoordsCopyInfo | boolean; // defaults to false
};

const FormInputField = observer(
  forwardRef<HTMLInputElement | null, FormInputFieldProps>((props: FormInputFieldProps, ref) => {
    // rest is used to send props to TextField without custom attributes
    const { getValue, setValue, isValidIntermediate, isValidValue, numeric: isNumeric, copyInfo, ...rest } = props;

    const initialValue = React.useState(() => getValue())[0];
    const inputRef = React.useRef<HTMLInputElement>(null);
    const lastValidValue = React.useRef(initialValue);
    const lastValidIntermediate = React.useRef(initialValue);

    React.useImperativeHandle(ref, () => inputRef.current!);

    function onChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
      const element = event.nativeEvent.target as HTMLInputElement;
      const candidate = element.value;

      if (!isValidIntermediate(candidate)) {
        event.preventDefault();

        element.value = lastValidIntermediate.current;
      } else {
        lastValidIntermediate.current = candidate;
      }
    }

    function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      const element = event.nativeEvent.target as HTMLInputElement;

      if (event.code === "Enter" || event.code === "NumpadEnter") {
        event.preventDefault();
        element.blur();
      } else if (isNumeric && event.code === "ArrowDown") {
        onConfirm(event);
        element.value = parseFloat(getValue()) - 1 + "";
        onConfirm(event);
      } else if (isNumeric && event.code === "ArrowUp") {
        onConfirm(event);
        element.value = parseFloat(getValue()) + 1 + "";
        onConfirm(event);
      } else if (event.code === "Escape") {
        element.value = "";
        element.blur();
      }

      rest.onKeyDown?.(event);
    }

    function onBlur(event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
      onConfirm(event);

      rest.onBlur?.(event);
    }

    function onConfirm(event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement, Event>) {
      const element = event.nativeEvent.target as HTMLInputElement;
      const candidate = element.value;
      let rtn: string;

      const result = isValidValue(candidate);
      const isValid = Array.isArray(result) ? result[0] : result;
      const payload = Array.isArray(result) ? result[1] : undefined;
      if (isValid === false) {
        element.value = rtn = lastValidValue.current;
      } else {
        rtn = candidate;
      }

      setValue(rtn, payload);
      inputRef.current &&
        (inputRef.current.value = lastValidValue.current = lastValidIntermediate.current = getValue());
    }

    const value = getValue();

    React.useEffect(() => {
      const value = getValue();
      if (value !== lastValidValue.current) {
        lastValidValue.current = value;
        lastValidIntermediate.current = value;
        inputRef.current!.value = value;
      }
    }, [value, getValue]);

    // if tooltip provided, wrap text input field within that
    // return tooltipText ? (
    //   <Tooltip title={tooltipText}>
    //     <TextField
    //       InputLabelProps={{ shrink: true }}
    //       inputRef={inputRef}
    //       size="small"
    //       defaultValue={initialValue}
    //       onChange={action(onChange)}
    //       {...rest}
    //       onKeyDown={action(onKeyDown)}
    //       onBlur={action(onBlur)}
    //       InputProps={{
    //         endAdornment: (copyInfo instanceof CoordsCopyInfo) ? (
    //           <InputAdornment position="end">
    //             <Tooltip title="Copy to clipboard">
    //               <IconButton onClick={(event: React.MouseEvent) => {
    //                 copyInfo.copyCallback({
    //                   event: event,
    //                   control: copyInfo.control
    //                 });
    //               }} size="small" sx={{
    //                 position: "absolute",
    //                 top: 6,
    //                 right: 6,
    //                 opacity: 0.4,              // make it transparent
    //                 pointerEvents: 'auto',     // allow hover
    //                 transition: 'opacity 0.2s',
    //                 '&:hover': {
    //                   opacity: 1               // full opacity on hover
    //                 }
    //               }}>
    //                 <ContentCopyIcon sx={{
    //                   width: "10px",
    //                   height: "10px",
    //                   color: "#D3D3D3",
    //                 }}></ContentCopyIcon>
    //               </IconButton>
    //             </Tooltip>
    //           </InputAdornment>
    //         ) : undefined
    //       }}
    //     />
    //   </Tooltip>
    // ) : (
    //   <TextField
    //     InputLabelProps={{ shrink: true }}
    //     inputRef={inputRef}
    //     size="small"
    //     defaultValue={initialValue}
    //     onChange={action(onChange)}
    //     {...rest}
    //     onKeyDown={action(onKeyDown)}
    //     onBlur={action(onBlur)}
    //   />
    // );
    return (
      <TextField
        InputLabelProps={{ shrink: true }}
        inputRef={inputRef}
        size="small"
        defaultValue={initialValue}
        onChange={action(onChange)}
        {...rest}
        onKeyDown={action(onKeyDown)}
        onBlur={action(onBlur)}
        InputProps={{
          endAdornment:
            copyInfo instanceof CoordsCopyInfo ? (
              <InputAdornment position="end">
                <Tooltip
                  title={copyInfo.infoToCopy === "POSITION" ? "Copy x- and y-coordinates" : "Copy ENTIRE coordinate"}>
                  <IconButton
                    onClick={(event: React.MouseEvent) => {
                      copyInfo.copyCallback({
                        event: event,
                        control: copyInfo.control,
                        infoToCopy: copyInfo.infoToCopy
                      });
                    }}
                    size="small"
                    sx={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      opacity: 0.4, // make it transparent
                      pointerEvents: "auto", // allow hover
                      transition: "opacity 0.2s",
                      "&:hover": {
                        opacity: 1 // full opacity on hover
                      }
                    }}>
                    <ContentCopyIcon
                      sx={{
                        width: "10px",
                        height: "10px",
                        color: "#D3D3D3"
                      }}></ContentCopyIcon>
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ) : undefined
        }}
      />
    );
  })
);

export { FormInputField };
