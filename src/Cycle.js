var Cycle = require('@cycle/run');

exports._run = function (_main, _driver) {
  return function () {
    function main (sources) {
      return {
        main: _main(sources.main)
      };
    }
    function driver (sink) {
      return _driver(sink)();
    }
    var dispose = Cycle.run(main, {
      main: driver
    });
    return function (unit) {
      return function () {
        dispose();
      };
    };
  };
};

function wrapDriver(eff) {
  return function (sink) {
    return eff(sink)();
  }
}

exports._runRecord = function (main, _driver) {
  return function () {
    var driver = {};
    var keys = Object.keys(_driver);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var eff = _driver[key];
      driver[key] = wrapDriver(eff);
    }

    var dispose = Cycle.run(main, driver);
    
    return function (unit) {
      return function () {
        dispose();
      };
    };
  };
};
