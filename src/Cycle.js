var Cycle = require('@cycle/xstream-run');
var xs = require('xstream').default;

function makeDriver(eff) {
  return function (sink) {
    return eff(sink)();
  };
}

exports._run1 = function (_main, _driver) {
  return function () {
    const stream = xs.create();

    const observer = {
      next: function (x) { stream.shamefullySendNext(x); },
      error: function (err) { stream.shamefullySendError(err); },
      complete: function () { stream.shamefullySendComplete(); },
    };

    var source = _driver(stream)();

    var sink = _main(source);

    sink.addListener(observer);
  };
};

exports._run2 = function (_main, _drivers) {
  return function () {
    function main(sources) {
      var sinks = _main(sources.a)(sources.b);
      return {
        a: sinks.value0,
        b: sinks.value1.value0
      };
    }
    var drivers = {
      a: makeDriver(_drivers.value0),
      b: makeDriver(_drivers.value1.value0)
    };
    return Cycle.run(main, drivers);
  };
};

exports._run3 = function (_main, _drivers) {
  return function () {
    function main(sources) {
      var sinks = _main(sources.a)(sources.b)(sources.c);
      return {
        a: sinks.value0,
        b: sinks.value1.value0,
        c: sinks.value1.value1.value0
      };
    }
    var drivers = {
      a: makeDriver(_drivers.value0),
      b: makeDriver(_drivers.value1.value0),
      c: makeDriver(_drivers.value1.value1.value0)
    };
    return Cycle.run(main, drivers);
  };
};

exports._run4 = function (_main, _drivers) {
  return function () {
    function main(sources) {
      var sinks = _main(sources.a)(sources.b)(sources.c)(sources.d);
      return {
        a: sinks.value0,
        b: sinks.value1.value0,
        c: sinks.value1.value1.value0,
        d: sinks.value1.value1.value1.value0
      };
    }
    var drivers = {
      a: makeDriver(_drivers.value0),
      b: makeDriver(_drivers.value1.value0),
      c: makeDriver(_drivers.value1.value1.value0),
      d: makeDriver(_drivers.value1.value1.value1.value0)
    };
    return Cycle.run(main, drivers);
  };
};

exports._run5 = function (_main, _drivers) {
  return function () {
    function main(sources) {
      var sinks = _main(sources.a)(sources.b)(sources.c)(sources.d)(sources.e);
      return {
        a: sinks.value0,
        b: sinks.value1.value0,
        c: sinks.value1.value1.value0,
        d: sinks.value1.value1.value1.value0,
        e: sinks.value1.value1.value1.value1.value0
      };
    }
    var drivers = {
      a: makeDriver(_drivers.value0),
      b: makeDriver(_drivers.value1.value0),
      c: makeDriver(_drivers.value1.value1.value0),
      d: makeDriver(_drivers.value1.value1.value1.value0),
      e: makeDriver(_drivers.value1.value1.value1.value1.value0)
    };
    return Cycle.run(main, drivers);
  };
};
