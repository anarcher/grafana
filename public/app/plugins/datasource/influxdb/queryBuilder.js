define([
  'lodash'
],
function (_) {
  'use strict';

  function InfluxQueryBuilder(target) {
    this.target = target;
  }

  function renderTagCondition (tag, index) {
    var str = "";
    if (index > 0) {
      str = (tag.condition || 'AND') + ' ';
    }

    if (tag.value && tag.value[0] === '/' && tag.value[tag.value.length - 1] === '/') {
      return str + '"' +tag.key + '"' + ' =~ ' + tag.value;
    }
    return str + '"' + tag.key + '"' + " = '" + tag.value + "'";
  }

  var p = InfluxQueryBuilder.prototype;

  p.build = function() {
    return this.target.rawQuery ? this._modifyRawQuery() : this._buildQuery();
  };

  p.buildExploreQuery = function(type, withKey) {
    var query;
    var measurement;

    if (type === 'TAG_KEYS') {
      query = 'SHOW TAG KEYS';
      measurement= this.target.measurement;
    } else if (type === 'TAG_VALUES') {
      query = 'SHOW TAG VALUES';
      measurement= this.target.measurement;
    } else if (type === 'MEASUREMENTS') {
      query = 'SHOW MEASUREMENTS';
    }

    if (measurement) {
      query += ' FROM "' + measurement + '"';
    }

    if (withKey) {
      query += ' WITH KEY = "' + withKey + '"';
    }

    if (this.target.tags && this.target.tags.length > 0) {
      var whereConditions = _.reduce(this.target.tags, function(memo, tag) {
        // do not add a condition for the key we want to explore for
        if (tag.key === withKey) {
          return memo;
        }
        memo.push(renderTagCondition(tag, memo.length));
        return memo;
      }, []);

      if (whereConditions.length > 0) {
        query +=  ' WHERE ' + whereConditions.join(' ');
      }
    }

    return query;
  };

  p._buildQuery = function() {
    var target = this.target;

    if (!target.measurement) {
      throw "Metric measurement is missing";
    }

    var query = 'SELECT ';
    var measurement = target.measurement;
    var aggregationFunc = target.function || 'mean';

    if (!measurement.match('^/.*/') && !measurement.match(/^merge\(.*\)/)) {
      measurement = '"' + measurement+ '"';
    }

    query +=  aggregationFunc + '(value)';
    query += ' FROM ' + measurement + ' WHERE ';
    var conditions = _.map(target.tags, function(tag, index) {
      return renderTagCondition(tag, index);
    });

    query += conditions.join(' ');
    query += (conditions.length > 0 ? ' AND ' : '') + '$timeFilter';

    query += ' GROUP BY time($interval)';
    if  (target.groupByTags && target.groupByTags.length > 0) {
      query += ', "' + target.groupByTags.join('", "') + '"';
    }

    if (target.fill) {
      query += ' fill(' + target.fill + ')';
    }

    query += " ORDER BY asc";
    target.query = query;

    return query;
  };

  p._modifyRawQuery = function () {
    var query = this.target.query.replace(";", "");
    return query;
  };

  return InfluxQueryBuilder;
});
