/**
 * @classdesc
 * OpenLayers 3 Grid Cluster Select Interaction Control
 *
 * If a cluster feature is clicked, the map pans to this cluster and zooms one level deeper.
 * If a single feature is clicked, it is selected/unselected just like in {ol.interaction.Select}.
 * The selected features are visible at any zoom level.
 *
 * @constructor
 * @extends {ol.interaction.Select}
 * @param options
 */
ol.interaction.SelectGridCluster = function (options) {
  options = options || {};

  /**
   * Enables animation, default is true.
   * @type {boolean}
   * @private
   */
  this.animate_ = options.animate !== undefined ? options.animate : true;

  /**
   * Animation duration in ms, default is 200ms.
   * @type {*}
   * @private
   */
  this.animationDuration_ = options.animationDuration || 200;

  var originalFilter = options.filter || ol.functions.TRUE;
  options.filter = function (feature, layer) {
    if (layer.getSource() instanceof ol.source.GridCluster && !feature.get("selectable")) {
      this.zoomToCluster(feature, layer);
      return false;
    }
    return originalFilter(feature, layer);
  };

  ol.interaction.Select.call(this, options);
};

ol.inherits(ol.interaction.SelectGridCluster, ol.interaction.Select);

/**
 * @inheritDoc
 */
ol.interaction.SelectGridCluster.prototype.setMap = function (map) {
  ol.interaction.Select.prototype.setMap.call(this, map);
  this.map_ = map;
};

/**
 * Zooms to a cluster feature
 * @param clusterFeature
 * @param clusterLayer
 */
ol.interaction.SelectGridCluster.prototype.zoomToCluster = function (clusterFeature, clusterLayer) {
  var view = this.map_.getView();
  var targetZoom = view.getZoom() + 1;
  var targetLocation = ol.extent.getCenter(clusterFeature.getGeometry().getExtent());

  if (this.animate_) {
    var self = this;
    setTimeout(function () {
      self.preloadFeaturesInClusterLayer_.call(self, clusterLayer, targetZoom);
    }, 0);

    this.zoomAndPanTo_(targetLocation, targetZoom);
  } else {
    view.setCenter(targetLocation);
    view.setZoom(targetZoom);
  }
};

/**
 * Preprocesses clustering of features in cluster layer source during zoom and pan animation
 * @param clusterLayer
 * @param targetZoom
 * @private
 */
ol.interaction.SelectGridCluster.prototype.preloadFeaturesInClusterLayer_ = function (clusterLayer, targetZoom) {
  var view = this.map_.getView();
  var currentExtent = view.calculateExtent(this.map_.getSize());
  var targetResolution = view.constrainResolution(view.getMaxResolution(), targetZoom - view.minZoom_, 0);
  clusterLayer.getSource().loadFeatures(currentExtent, targetResolution, view.getProjection());
};

/**
 * Performs map view zoom and pan animation
 * @param targetLocation
 * @param targetZoom
 * @private
 */
ol.interaction.SelectGridCluster.prototype.zoomAndPanTo_ = function (targetLocation, targetZoom) {
  var view = this.map_.getView();
  view.animate({
    center: targetLocation,
    zoom: targetZoom,
    duration: this.animationDuration_
  });
};
