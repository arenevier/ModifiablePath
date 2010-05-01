/* Copyright (c) 2010 arno <arno@renevier.net>, published under the Clear BSD
 * license.  See http://svn.openlayers.org/trunk/openlayers/license.txt for the
 * full text of the license. */


/**
 * @requires OpenLayers/Handler/Point.js
 * @requires OpenLayers/Geometry/Point.js
 * @requires OpenLayers/Geometry/LineString.js
 * @requires OpenLayers/Feature/Vector.js
 * @requires OpenLayers/Control/DragFeature.js
 */


/**
 * Class: OpenLayers.Handler.ModifiablePath
 * Handler to draw and modify a path on the map.
 *
 * Inherits from:
 *  - <OpenLayers.Handler.Point>
 */
OpenLayers.Handler.ModifiablePath = OpenLayers.Class(OpenLayers.Handler.Point, {

    /**
     * Property: line
     * {<OpenLayers.Feature.Vector>}
     */
    line: null,

    /**
     * Property: dragControl
     * {<OpenLayers.Control.DragFeature>}
     */
    dragControl: null,

    /**
     * Constructor: OpenLayers.Handler.ModifiablePath
     * Create a new path hander
     *
     * Parameters:
     * control - {<OpenLayers.Control>} The control that owns this handler
     * callbacks - {Object} An object with a properties whose values are
     *     functions.  Various callbacks described below.
     * options - {Object} An optional object with properties to be set on the
     *           handler
     *
     * Named callbacks:
     * create - Called when a sketch is first created.  Callback called with
     *     the creation point geometry and sketch feature.
     * modify - Called with each move of a vertex with the vertex (point)
     *     geometry and the sketch feature.
     * point - Called as each point is added.  Receives the new point geometry.
     * done - Called when the point drawing is finished.  The callback will
     *     recieve a single argument, the linestring geometry.
     * cancel - Called when the handler is deactivated while drawing.  The
     *     cancel callback will receive a geometry.
     */
    initialize: function(control, callbacks, options) {
        OpenLayers.Handler.Point.prototype.initialize.apply(this, arguments);
    },

    /**
     * Method: createFeature
     * Add temporary geometries
     *
     * Parameters:
     * pixel - {<OpenLayers.Pixel>} The initial pixel location for the new
     *     feature.
     */
    createFeature: function(pixel) {
        var handler = this;
        if (!this.dragControl) {
            var dragOptions = {
                onDrag: function(dragFeature, pixel) {
                    this.layer.redraw();
                },
                geometryTypes: "OpenLayers.Geometry.Point"
            }
            this.dragControl = new OpenLayers.Control.DragFeature(this.layer, dragOptions);
            this.control.map.addControl(this.dragControl);
        }
        this.dragControl.activate();

        var lonlat = this.control.map.getLonLatFromPixel(pixel);
        this.point = new OpenLayers.Feature.Vector(
            new OpenLayers.Geometry.Point(lonlat.lon, lonlat.lat)
        );
        this.line = new OpenLayers.Feature.Vector(
            new OpenLayers.Geometry.LineString([this.point.geometry])
        );
        this.callback("create", [this.point.geometry, this.line]);
        this.point.geometry.clearBounds();
        // XXX: add point before line, otherwise, Canvas.getFeatureIdFromEvent
        // returns the line, and we need the point for dragControl
        this.layer.addFeatures([this.point, this.line], {silent: true});
    },

    /**
     * Method: addPoint
     * Add point to geometry.  Send the point index to override
     * the behavior of LinearRing that disregards adding duplicate points.
     *
     * Parameters:
     * pixel - {<OpenLayers.Pixel>} The pixel location for the new point.
     */
    addPoint: function(pixel) {
        var lonlat = this.control.map.getLonLatFromPixel(pixel);
        this.point = new OpenLayers.Feature.Vector(
            new OpenLayers.Geometry.Point(lonlat.lon, lonlat.lat)
        );
        this.layer.addFeatures([this.point]);
        this.line.geometry.addComponent(
            this.point.geometry, this.line.geometry.components.length
        );
        if (this.layer.renderer instanceof OpenLayers.Renderer.Canvas) {
            // XXX: to have dragControl working, we need getFeatureIdFromEvent
            // to return Point (and not LineString). So, we erase this.line.
            // As, it will be added back in drawFeature, it will after Point in
            // array position, and getFeatureIdFromEvent will return correct
            // answer
            this.layer.renderer.eraseFeatures(this.line);
        }
        this.callback("point", [this.point.geometry, this.getGeometry()]);
        this.callback("modify", [this.point.geometry, this.line]);
        this.drawFeature();
    },

    /**
     * Method: drawFeature
     * Render geometries on the temporary layer.
     */
    drawFeature: function() {
        this.layer.drawFeature(this.point, this.style);
        this.layer.drawFeature(this.line, this.style);
    },

    /**
     * Method: getGeometry
     * Return the sketch geometry.  If <multi> is true, this will return
     *     a multi-part geometry.
     *
     * Returns:
     * {<OpenLayers.Geometry.LineString>}
     */
    getGeometry: function() {
        var geometry = this.line && this.line.geometry;
        return geometry;
    },

    /**
     * Method: finalize
     * Finish the geometry
     *
     * Parameters:
     * cancel - {Boolean} Call cancel instead of done callback.  Default is
     *     false.
     */
    finalize: function(cancel) {
        OpenLayers.Handler.Point.prototype.finalize.apply(this, arguments);
        this.dragControl.deactivate();
    },

    /**
     * Method: mousedown
     * Handle mouse down.  Do nothing. New points are added on mouseup
     * 
     * Parameters:
     * evt - {Event} The browser event
     *
     * Returns: 
     * {Boolean} Allow event propagation
     */
    mousedown: function(evt) {
        this.mouseDown = true;
        this.lastDown = evt.xy;
        return true;
    },

    /**
     * Method: mousemove
     * Handle mouse move.  Do nothing. If mousemove modify path, it's not
     * possible to select an anterior point anymore.
     * 
     * Parameters:
     * evt - {Event} The browser event
     *
     * Returns: 
     * {Boolean} Allow event propagation
     */
    mousemove: function (evt) {
        return true;
    },

    /**
     * Method: mouseup
     * Handle mouse up.  Add a new point to the geometry and
     * render it. Return determines whether to propagate the event on the map.
     * 
     * Parameters:
     * evt - {Event} The browser event
     *
     * Returns: 
     * {Boolean} Allow event propagation
     */
    mouseup: function (evt) {
        if (this.dragControl && 
            (this.dragControl.handlers.drag.start != this.dragControl.handlers.drag.last)) {
            // we are modifying a point, return
            return true;
        }
        if (this.dragControl && this.dragControl.handlers.drag.started) {
            return true;
        }
        // double-clicks
        if (this.lastUp && this.lastUp.equals(evt.xy)) {
            return this.finalize();
        }

        if(this.lastUp == null) {
            if(this.persist) {
                this.destroyFeature();
            }
            this.createFeature(evt.xy);
        } else {
            this.addPoint(evt.xy);
        }

        this.mouseDown = false;
        this.drawing = true;
        this.lastUp = evt.xy;
        return true;
    },

    CLASS_NAME: "OpenLayers.Handler.ModifiablePath"
});
