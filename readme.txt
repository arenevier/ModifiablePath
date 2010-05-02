ModifiablePath is an Openlayers Class similar to Openlayers.Handler.Path

When placing points with standard Path hander, once a point has been placed,
it's not possible to modify it.

With ModifiablePath, it's possible to drap points of the path to move them.
Also, when pressing Shift key, yes enter in delete mode. When in delete mode,
clicking on a point of the path deletes the point. Releasing Shift key leaves
delete mode.

Once path has been finalized (by double clicking), the path cannot be modified
anymore.
