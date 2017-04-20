/**
 * @classdesc
 * OpenLayers 3 Grid Cluster
 *
 * Layer source to cluster grid vector data. Becomes and stores data as a collection of smallest grid cells center points.
 * Depending on zoom level clusters the small grid cells in bigger grid cells.
 * Cluster features have a property 'fill', which shows how many grid cells contains this cluster.
 *
 * For a high performance, the source points are given not in form of {ol.source.Vector} with a collection of {ol.Feature},
 * but as a simple array of objects with id, x and y properties.
 *
 * @constructor
 * @extends {ol.source.Vector}
 * @param options
 */
ol.source.GridCluster = function (options) {
  ol.source.Vector.call(this, {
    attributions: options.attributions,
    extent: options.extent,
    logo: options.logo,
    projection: options.projection,
    wrapX: options.wrapX
  });

  /**
   * Width of the side of a grid square in units of a projection
   * @type {number}
   * @private
   */
  this.sideWidth_ = options.sideWidth;
  ol.asserts.assert(this.sideWidth_ > 0, 29); // `sideWidth` must be greater than `0`

  /**
   * Minimal grid side width in px, default is 30px.
   * @type {number}
   * @private
   */
  this.sideMinWidthPx_ = options.sideMinWidthPx !== undefined ? options.sideMinWidthPx : 30;

  /**
   * Global grid corner coordinate
   * @type {ol.Coordinate}
   * @private
   */
  this.cornerCoordinate_ = options.cornerCoordinate !== undefined ? options.cornerCoordinate : [0, 0];

  /**
   * Source features (coordinates) loading function. Use it to dynamically load features only in the current map extent.
   * @type {function}
   * @private
   */
  this.loader_ = options.loader !== undefined ? options.loader : undefined;

  /**
   * If features are not supposed to be changed, setting this property to true can improve the performance
   * @type {boolean}
   * @private
   */
  this.ignoreFeatureChanges_ = options.ignoreFeatureChanges !== undefined ? options.ignoreFeatureChanges : false;

  this.extent_ = ol.extent.createEmpty();
  this.loadedExtent_ = ol.extent.createEmpty();
  this.coordinates_ = [];
  this.features_ = [];
  this.singleFeatureCache = new Map();

};
ol.inherits(ol.source.GridCluster, ol.source.Vector);

/**
 * Clears the single feature cache
 */
ol.source.GridCluster.prototype.clearCache = function () {
  this.singleFeatureCache.clear();
};

/**
 * Sets the source features and triggers clustering
 * @param coordinates - array of objects with id, x and y properties. x and y represents the coordinates of the center point of a cell.
 */
ol.source.GridCluster.prototype.setCoordinates = function (coordinates) {
  this.coordinates_ = coordinates;
  this.refresh_();
};

/**
 * Returns a single feature for a coordinate from a single feature cache if it already exists or creates it.
 * @param coordinate - object with id, x and y properties. x and y represents the coordinates of the center point of a cell.
 * @returns {ol.Feature}
 */
ol.source.GridCluster.prototype.getSingleFeatureForCoordinate = function(coordinate) {
  if (this.singleFeatureCache.has(coordinate.id)) {
    return this.singleFeatureCache.get(coordinate.id);
  }
  var corner = this.calculateCornerPoint_(coordinate, this.sideWidth_);
  return this.createClusterFeature_(corner.x, corner.y, this.sideWidth_, [coordinate]);
};

/**
 * @private
 */
ol.source.GridCluster.prototype.refresh_ = function () {
  this.clear(true);
  this.cluster_();
  this.addFeatures(this.features_);
  this.changed();
};

/**
 * @inheritDoc
 */
ol.source.GridCluster.prototype.loadFeatures = function (extent, resolution, projection) {
  if (resolution === undefined || ol.extent.isEmpty(extent)) {
    return;
  }

  if (this.loader_ && !ol.extent.containsExtent(this.loadedExtent_, extent)) {
    this.clear(true);
    this.coordinates_ = [];
    this.features_ = [];
    var bufferedExtent = this.bufferExtent_(extent, 0.5)
    if (this.loader_.call(this, bufferedExtent, resolution, projection)) {
      this.loadedExtent_ = bufferedExtent;
    }
    return;
  }

  var newSideWidth = this.getSideWidth_(resolution);
  if (newSideWidth !== this.currentSideWidth_ || !ol.extent.containsExtent(this.extent_, extent)) {
    this.clear(true);
    this.currentSideWidth_ = newSideWidth;
    this.extent_ = this.bufferExtent_(extent, 0.5);
    this.cluster_();
    this.addFeatures(this.features_);
  }
};

/**
 * Calculates a buffer for an extent.
 * @param extent
 * @param factor
 * @returns {ol.Extent}
 * @private
 */
ol.source.GridCluster.prototype.bufferExtent_ = function (extent, factor) {
  return ol.extent.buffer(extent, Math.max(ol.extent.getWidth(extent), ol.extent.getHeight(extent)) * factor)
}

/**
 * Creates cluster features from original features.
 * @private
 */
ol.source.GridCluster.prototype.cluster_ = function () {
  this.features_.length = 0;
  var clusteredFeatureMap = new Map();

  for (var i = 0, ii = this.coordinates_.length; i < ii; i++) {
    var coordinate = this.coordinates_[i];

    if (!ol.extent.containsXY(this.extent_, coordinate.x, coordinate.y)) {
      continue;
    }

    var cornerPoint = this.calculateCornerPoint_(coordinate, this.currentSideWidth_);

    if (!clusteredFeatureMap.has(cornerPoint.x)) {
      clusteredFeatureMap.set(cornerPoint.x, new Map());
    }

    if (!clusteredFeatureMap.get(cornerPoint.x).has(cornerPoint.y)) {
      clusteredFeatureMap.get(cornerPoint.x).set(cornerPoint.y, []);
    }

    clusteredFeatureMap.get(cornerPoint.x).get(cornerPoint.y).push(coordinate);
  }

  var gridCluster = this;
  clusteredFeatureMap.forEach(function (clusteredFeatureMapY, cornerX) {
    clusteredFeatureMapY.forEach(function (features, cornerY) {
      gridCluster.features_.push(gridCluster.createClusterFeature_(cornerX, cornerY, gridCluster.currentSideWidth_, features));
    })
  });
};

/**
 * Creates a cluster feature with a list of actual coordinate features
 * @param cornerX
 * @param cornerY
 * @param clusterFeatureSideWidth
 * @param {Array.<ol.Feature>} features Features
 * @return {ol.Feature} The cluster feature.
 * @private
 */
ol.source.GridCluster.prototype.createClusterFeature_ = function (cornerX, cornerY, clusterFeatureSideWidth, features) {
  var scaleFactor = clusterFeatureSideWidth / this.sideWidth_;
  var maxFeatureCount = Math.pow(scaleFactor, 2);
  var fill = features.length / maxFeatureCount;
  var isSingleFeature = maxFeatureCount === 1;
  var featureId = isSingleFeature ? features[0].id : scaleFactor + "_" + features[0].id;

  if (isSingleFeature && this.singleFeatureCache.has(featureId)) {
    return this.singleFeatureCache.get(featureId);
  }

  var polygonPoints = [
    [cornerX, cornerY],
    [cornerX, cornerY + clusterFeatureSideWidth],
    [cornerX + clusterFeatureSideWidth, cornerY + clusterFeatureSideWidth],
    [cornerX + clusterFeatureSideWidth, cornerY],
    [cornerX, cornerY]
  ];

  var clusterFeature = new ol.Feature(new ol.geom.Polygon([polygonPoints]));
  clusterFeature.set('features', features);
  clusterFeature.set('fill', fill);
  clusterFeature.set('selectable', isSingleFeature);
  clusterFeature.setId(featureId)

  if (isSingleFeature) {
    this.singleFeatureCache.set(featureId, clusterFeature);
  }

  return clusterFeature;
};

/**
 * Calculates the coordinates of the corner point of a cluster grid cell for a coordinate with a given side width
 * @param coordinate
 * @param sideWidth
 * @returns {{x: number, y: number}}
 * @private
 */
ol.source.GridCluster.prototype.calculateCornerPoint_ = function(coordinate, sideWidth) {
  return {
    x: Math.floor((coordinate.x - this.cornerCoordinate_[0]) / sideWidth) * sideWidth,
    y: Math.floor((coordinate.y - this.cornerCoordinate_[1]) / sideWidth) * sideWidth
  };
};

/**
 * Calculations cluster grid side width for the given resolution
 * @param resolution
 * @returns {number}
 * @private
 */
ol.source.GridCluster.prototype.getSideWidth_ = function (resolution) {
  var sideMinWidth = resolution * this.sideMinWidthPx_;
  var sideWidth = this.sideWidth_;
  while (sideWidth < sideMinWidth) {
    sideWidth *= 2;
  }
  return sideWidth;
};

/**
 * @inheritDoc
 */
ol.source.GridCluster.prototype.setupChangeEvents_ = function (featureKey, feature) {
  if (!this.ignoreFeatureChanges_) {
    ol.source.Vector.setupChangeEvents_.call(this, featureKey, feature);
  }
};
