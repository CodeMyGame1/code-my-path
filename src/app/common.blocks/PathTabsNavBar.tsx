import React, { useState } from "react";
import { observer } from "mobx-react-lite";
import { Tabs, Tab, Box, IconButton, TextField } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { getAppStores } from "@core/MainApp";
// Assuming these commands exist in your Command.ts file
import { RemovePathsAndEndControls, UpdateProperties } from "@core/Command";

export const PathTabsNavBar = observer(() => {
  const { app } = getAppStores();
  const [renamingUid, setRenamingUid] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleTabChange = (event: React.SyntheticEvent, newValue: string) => {
    app.setActivePath(newValue);
  };

  const handleCloseTab = (event: React.MouseEvent, pathUid: string) => {
    event.stopPropagation(); // Don't trigger the tab switch when clicking close
    if (app.paths.length <= 1) return; // Prevent closing the last tab

    const confirmDelete = window.confirm(
      "Are you sure you want to close this tab? This will completely delete the path."
    );
    if (!confirmDelete) return;

    const pathToDelete = app.paths.find(p => p.uid === pathUid);
    if (!pathToDelete) return;

    // Execute the deletion and register it to the undo history
    const command = new RemovePathsAndEndControls(app.paths, [pathToDelete]);
    app.history.execute(`Remove tab`, command);

    // If we just closed the active tab, switch to the first available tab
    if (app.activePathUid === pathUid) {
      app.setActivePath(app.paths[0].uid);
    }
  };

  const handleRename = (event: React.KeyboardEvent, pathUid: string) => {
    if (event.key === "Enter") {
      const path = app.paths.find(p => p.uid === pathUid);
      if (path && editName.trim() !== "") {
        app.history.execute(`Rename tab`, new UpdateProperties(path, { name: editName }));
      }
      setRenamingUid(null);
    } else if (event.key === "Escape") {
      setRenamingUid(null);
    }
  };

  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper", display: "flex", width: "100%" }}>
      <Tabs
        value={app.activePathUid || false}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ flexGrow: 1 }}>
        {app.paths.map(path => (
          <Tab
            key={path.uid}
            value={path.uid}
            onDoubleClick={() => {
              setRenamingUid(path.uid);
              setEditName(path.name);
            }}
            label={
              <Box sx={{ display: "flex", alignItems: "center" }}>
                {renamingUid === path.uid ? (
                  <TextField
                    size="small"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => handleRename(e, path.uid)}
                    onBlur={() => setRenamingUid(null)}
                    autoFocus
                    sx={{ width: 100 }}
                  />
                ) : (
                  <Box sx={{ pr: 1 }}>{path.name}</Box>
                )}
                {app.paths.length > 1 && renamingUid !== path.uid && (
                  <IconButton size="small" onClick={e => handleCloseTab(e, path.uid)} sx={{ padding: "2px", ml: 1 }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            }
          />
        ))}
      </Tabs>
    </Box>
  );
});
