/* Copyright (c) 2010 arno <arno@renevier.net>, published under the Clear BSD
 * license.  See http://svn.openlayers.org/trunk/openlayers/license.txt for the
 * full text of the license. */


/**
 * @requires OpenLayers/Handler/Point.js
 * @requires OpenLayers/Handler/Keyboard.js
 * @requires OpenLayers/Handler/Feature.js
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
     * Property: handlers
     * {Object} Object with references to multiple <OpenLayers.Handler>
     *     instances.
     */
    handlers: null,

    /**
     * Property: deleteKey
     * {int} key to use to enter delete mode
     */
    deleteKey: 16, // shift

    /**
     * Property: deleteMode
     * {Boolean} true if we're in delete mode
     */
    deleteMode: false,

    /**
     * Property: lastMoveDrag
     * {Boolean} true if last time mouse was down, a drag action occured
     */
    lastMoveDrag: false,

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
        var keyboardCallbacks = {
            keydown: this.handleKeyEvent,
            keyup: this.handleKeyEvent
        };
        this.handlers = OpenLayers.Util.extend({
            keyboard: new OpenLayers.Handler.Keyboard(this, keyboardCallbacks)
        }, this.handlers);
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
        // returns the line, and we need the point for handlers.drag
        this.layer.addFeatures([this.point, this.line], {silent: true});

        if (!this.handlers.drag) {
            var dragOptions = {
                geometryTypes: "OpenLayers.Geometry.Point",

                onDrag: OpenLayers.Function.bind(function(dragFeature, pixel) {
                    this.lastMoveDrag = true;
                    this.callback("modify", [dragFeature, this.line]);
                    this.layer.redraw();
                }, this)
            }
            this.handlers.drag = new OpenLayers.Control.DragFeature(this.layer, dragOptions);
            this.map.addControl(this.handlers.drag);
        }

        if (!this.handlers.feature) {
            var featureCallbacks = {
                click: this.clickFeatureEvent,
                over: this.overFeatureEvent,
                out: this.outFeatureEvent
            }
            var featureOptions = {
                geometryTypes: "OpenLayers.Geometry.Point"
            }
            this.handlers.feature = new OpenLayers.Handler.Feature(this, this.layer, featureCallbacks);
            this.handlers.feature.click = function(evt) {
                Event.stop(evt);
                return this.handle(evt) ? !this.stopClick : true;
            }
            this.map.events.register("mouseout", this, function(evt) {
                // when mouse leaves map area, leave delete mode
                if (this.deleteMode) {
                    var target = (evt.relatedTarget) ? evt.relatedTarget : evt.toElement;
                    var par = target;
                    while (par) {
                        if (par == this.map.viewPortDiv) {
                            // mouseout occured to another element of map
                            // viewport. Do not leave delete mode
                            return;
                        }
                        par = par.parentNode;
                    }
                    this.enterDeleteMode(false);
                }
            });
        }

        for (var item in this.handlers) {
            this.handlers[item].activate();
        }
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
            // XXX: to have handlers.drag working, we need getFeatureIdFromEvent
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
        for (var item in this.handlers) {
            this.handlers[item].deactivate();
        }
    },

    /**
     * Method: mousedown
     * Handle mouse down.
     * 
     * Parameters:
     * evt - {Event} The browser event
     *
     * Returns: 
     * {Boolean} Allow event propagation
     */
    mousedown: function(evt) {
        if (this.deleteMode) {
            return true;
        }
        this.lastMoveDrag = false;
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
        if (this.deleteMode) {
            return true;
        }
        if (this.lastMoveDrag) {
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

    /**
     * Method: handleKeyEvent
     * Handle keyup and keydown events. Enter deleteMode when deleteKey has
     * been pressed. Leave deleteMode when deleteKey has been released.
     * 
     * Parameters:
     * evt - {Event} The browser event
     */
    handleKeyEvent: function (evt) {
        if (evt.keyCode != this.deleteKey) {
            return;
        }
        if (evt.type == "keydown" && this.deleteMode) {
            return;
        }
        if (evt.type == "keyup" && !this.deleteMode) {
            return;
        }
        this.enterDeleteMode(!this.deleteMode);
    },

    /**
     * Method: enterDeleteMode
     * Method to enter or leave delete mode.
     * 
     * Parameters:
     * {Boolean} true to enter, false to leave
     */
    enterDeleteMode: function (mode) {
        if (mode == true && this.layer.features.length <= 2) { // 2: line + one point
            return;
        }
        this.deleteMode = mode;
        for (var i = this.layer.features.length; i-->0;) {
            var feature = this.layer.features[i];
            if (feature.geometry instanceof OpenLayers.Geometry.Point) {
                feature.renderIntent = this.deleteMode ? "select": "";
                this.layer.drawFeature(feature);
            }
        }
        if (this.deleteMode) {
            this.handlers.drag.deactivate();
        } else {
            this.handlers.drag.activate();
        }
    },

    /**
     * Method: clickFeatureEvent
     * Handle click on a feature. If we are in deleteMode, remove that feature.
     * 
     * Parameters:
     * feature - {OpenLayers.Feature.Vector} Feature that was clicked
     */
    clickFeatureEvent: function (feature) {
        if (!this.deleteMode) {
            return;
        }
        for (var i = feature.layer.features.length; i-->0; ) {
            var feat = feature.layer.features[i];
            if (feat == feature) {
                continue;
            }
            if (!feat.geometry.components) {
                continue;
            }

            var idx = feat.geometry.components.indexOf(feature.geometry);
            if (idx != -1) {
                feat.geometry.components.splice(idx, 1);
            }
        }
        this.callback("delete", [feature, feature.layer.features]);
        feature.destroy();
        this.layer.redraw();
        OpenLayers.Element.removeClass(
            this.map.viewPortDiv, "olModifiablePathOver"
        );
        if (this.layer.features.length <= 2) { // 2: line + one point
            this.enterDeleteMode(false);
        }
    },

    /**
     * Method: overFeatureEvent
     * Handle overing on a feature. If we are in deleteMode, modify viewport classname
     * 
     * Parameters:
     * feature - {OpenLayers.Feature.Vector} Feature that was clicked
     */
    overFeatureEvent: function (feature) {
        if (!this.deleteMode)
            return;
        OpenLayers.Element.addClass(
                this.map.viewPortDiv, "olModifiablePathOver"
        );
    },

    /**
     * Method: outFeatureEvent
     * Handle out of a feature. If we are in deleteMode, modify viewport classname
     * 
     * Parameters:
     * feature - {OpenLayers.Feature.Vector} Feature that was clicked
     */
    outFeatureEvent: function (feature) {
        if (!this.deleteMode)
            return;
        OpenLayers.Element.removeClass(
                this.map.viewPortDiv, "olModifiablePathOver"
        );
    },

    CLASS_NAME: "OpenLayers.Handler.ModifiablePath"
});
