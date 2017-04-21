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
