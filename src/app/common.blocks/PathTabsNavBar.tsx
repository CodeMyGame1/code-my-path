import "./PathTabsNavBar.scss";

import React, { useState, useRef, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { getAppStores } from "@core/MainApp";
import { RemovePathsAndEndControls, UpdateProperties, AddPath } from "@core/Command";
import { Segment, EndControl } from "@core/Path";

/**
 * Chrome-style tab bar for switching between autonomous paths.
 *
 * Design reference: Chrome dark-mode tab bar — capsule-shaped active tab,
 * hidden close buttons that appear on hover, subtle separators between
 * inactive tabs, and an add-tab (+) button.
 */
export const PathTabsNavBar = observer(() => {
  const { app } = getAppStores();
  const [renamingUid, setRenamingUid] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the active tab when it changes
  useEffect(() => {
    if (!scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector(".path-tab--active");
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [app.activePathUid]);

  const handleTabClick = (pathUid: string) => {
    if (renamingUid) return; // Don't switch tabs while renaming
    app.setActivePath(pathUid);
  };

  const handleCloseTab = (event: React.MouseEvent, pathUid: string) => {
    event.stopPropagation();
    if (app.paths.length <= 1) return;

    const confirmDelete = window.confirm(
      "Are you sure you want to close this tab? This will completely delete the path."
    );
    if (!confirmDelete) return;

    const pathToDelete = app.paths.find(p => p.uid === pathUid);
    if (!pathToDelete) return;

    const command = new RemovePathsAndEndControls(app.paths, [pathToDelete]);
    app.history.execute(`Remove tab`, command);

    if (app.activePathUid === pathUid) {
      app.setActivePath(app.paths[0].uid);
    }
  };

  const handleDoubleClick = (event: React.MouseEvent, pathUid: string, pathName: string) => {
    event.stopPropagation();
    setRenamingUid(pathUid);
    setEditName(pathName);
  };

  const handleRenameKeyDown = (event: React.KeyboardEvent, pathUid: string) => {
    if (event.key === "Enter") {
      commitRename(pathUid);
    } else if (event.key === "Escape") {
      setRenamingUid(null);
    }
  };

  const commitRename = (pathUid: string) => {
    const path = app.paths.find(p => p.uid === pathUid);
    if (path && editName.trim() !== "") {
      app.history.execute(`Rename tab`, new UpdateProperties(path, { name: editName }));
    }
    setRenamingUid(null);
  };

  const handleAddTab = () => {
    const newPath = app.format.createPath(new Segment(new EndControl(0, 0, 0), new EndControl(10, 0, 0)));
    newPath.name = `Path ${app.paths.length + 1}`;
    const command = new AddPath(app.paths, newPath);
    app.history.execute(`Add new tab`, command);
    app.setActivePath(newPath.uid);
  };

  return (
    <div className="path-tabs-bar">
      <div className="path-tabs-scroll" ref={scrollRef}>
        {app.paths.map(path => {
          const isActive = app.activePathUid === path.uid;
          const isRenaming = renamingUid === path.uid;

          return (
            <div
              key={path.uid}
              className={`path-tab ${isActive ? "path-tab--active" : ""}`}
              onClick={() => handleTabClick(path.uid)}
              onDoubleClick={e => handleDoubleClick(e, path.uid, path.name)}>
              {/* Favicon-style icon */}
              <span className="path-tab__icon">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M9.78 11.16l-1.42 1.42a7.462 7.462 0 01-1.06-1.88l1.76-.7c.18.52.44 1 .72 1.16zM11 6l1.25-1.25c.41-.42.41-1.09 0-1.5L9.9.9a1.06 1.06 0 00-1.5 0 1.06 1.06 0 000 1.5L9.65 3.65 8 5.3V8h2.7L12 6.7l1.25 1.25c.41.42 1.09.42 1.5 0 .42-.41.42-1.09 0-1.5L11 2.8"
                    opacity="0"
                  />
                  <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" />
                </svg>
              </span>

              {/* Tab label or rename input */}
              {isRenaming ? (
                <input
                  className="path-tab__rename-input"
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => handleRenameKeyDown(e, path.uid)}
                  onBlur={() => commitRename(path.uid)}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="path-tab__label">{path.name}</span>
              )}

              {/* Close button — hidden by default, revealed on hover */}
              {app.paths.length > 1 && !isRenaming && (
                <button
                  className="path-tab__close"
                  onClick={e => handleCloseTab(e, path.uid)}
                  tabIndex={-1}
                  aria-label={`Close ${path.name}`}>
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add-tab button */}
      <button className="path-tabs-add" onClick={handleAddTab} aria-label="New tab">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
});
