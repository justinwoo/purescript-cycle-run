(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
function logToConsoleError(err) {
    var target = err.stack || err;
    if (console && console.error) {
        console.error(target);
    }
    else if (console && console.log) {
        console.log(target);
    }
}
function makeSinkProxies(drivers, streamAdapter) {
    var sinkProxies = {};
    for (var name_1 in drivers) {
        if (drivers.hasOwnProperty(name_1)) {
            var holdSubject = streamAdapter.makeSubject();
            var driverStreamAdapter = drivers[name_1].streamAdapter || streamAdapter;
            var stream = driverStreamAdapter.adapt(holdSubject.stream, streamAdapter.streamSubscribe);
            sinkProxies[name_1] = {
                stream: stream,
                observer: holdSubject.observer,
            };
        }
    }
    return sinkProxies;
}
function callDrivers(drivers, sinkProxies, streamAdapter) {
    var sources = {};
    for (var name_2 in drivers) {
        if (drivers.hasOwnProperty(name_2)) {
            var driverOutput = drivers[name_2](sinkProxies[name_2].stream, streamAdapter, name_2);
            var driverStreamAdapter = drivers[name_2].streamAdapter;
            if (driverStreamAdapter && driverStreamAdapter.isValidStream(driverOutput)) {
                sources[name_2] = streamAdapter.adapt(driverOutput, driverStreamAdapter.streamSubscribe);
            }
            else {
                sources[name_2] = driverOutput;
            }
            if (sources[name_2] && typeof sources[name_2] === 'object') {
                sources[name_2]._isCycleSource = name_2;
            }
        }
    }
    return sources;
}
function replicateMany(sinks, sinkProxies, streamAdapter) {
    var results = Object.keys(sinks)
        .filter(function (name) { return !!sinkProxies[name]; })
        .map(function (name) {
        return streamAdapter.streamSubscribe(sinks[name], {
            next: function (x) { sinkProxies[name].observer.next(x); },
            error: function (err) {
                logToConsoleError(err);
                sinkProxies[name].observer.error(err);
            },
            complete: function (x) {
                sinkProxies[name].observer.complete(x);
            }
        });
    });
    var disposeFunctions = results
        .filter(function (dispose) { return typeof dispose === 'function'; });
    return function () {
        disposeFunctions.forEach(function (dispose) { return dispose(); });
    };
}
function disposeSources(sources) {
    for (var k in sources) {
        if (sources.hasOwnProperty(k) && sources[k]
            && typeof sources[k].dispose === 'function') {
            sources[k].dispose();
        }
    }
}
var isObjectEmpty = function (obj) { return Object.keys(obj).length === 0; };
function Cycle(main, drivers, options) {
    if (typeof main !== "function") {
        throw new Error("First argument given to Cycle must be the 'main' " +
            "function.");
    }
    if (typeof drivers !== "object" || drivers === null) {
        throw new Error("Second argument given to Cycle must be an object " +
            "with driver functions as properties.");
    }
    if (isObjectEmpty(drivers)) {
        throw new Error("Second argument given to Cycle must be an object " +
            "with at least one driver function declared as a property.");
    }
    var streamAdapter = options.streamAdapter;
    if (!streamAdapter || isObjectEmpty(streamAdapter)) {
        throw new Error("Third argument given to Cycle must be an options object " +
            "with the streamAdapter key supplied with a valid stream adapter.");
    }
    var sinkProxies = makeSinkProxies(drivers, streamAdapter);
    var sources = callDrivers(drivers, sinkProxies, streamAdapter);
    var sinks = main(sources);
    if (typeof window !== 'undefined') {
        window.Cyclejs = { sinks: sinks };
    }
    var run = function () {
        var disposeReplication = replicateMany(sinks, sinkProxies, streamAdapter);
        return function () {
            disposeSources(sources);
            disposeReplication();
        };
    };
    return { sinks: sinks, sources: sources, run: run };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Cycle;

},{}],2:[function(require,module,exports){
"use strict";
var xstream_1 = require('xstream');
var XStreamAdapter = {
    adapt: function (originStream, originStreamSubscribe) {
        if (XStreamAdapter.isValidStream(originStream)) {
            return originStream;
        }
        ;
        var dispose = null;
        return xstream_1.default.create({
            start: function (out) {
                var observer = out;
                dispose = originStreamSubscribe(originStream, observer);
            },
            stop: function () {
                if (typeof dispose === 'function') {
                    dispose();
                }
            }
        });
    },
    makeSubject: function () {
        var stream = xstream_1.default.create();
        var observer = {
            next: function (x) { stream.shamefullySendNext(x); },
            error: function (err) { stream.shamefullySendError(err); },
            complete: function () { stream.shamefullySendComplete(); }
        };
        return { observer: observer, stream: stream };
    },
    remember: function (stream) {
        return stream.remember();
    },
    isValidStream: function (stream) {
        return (typeof stream.addListener === 'function' &&
            typeof stream.shamefullySendNext === 'function');
    },
    streamSubscribe: function (stream, observer) {
        stream.addListener(observer);
        return function () { return stream.removeListener(observer); };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = XStreamAdapter;

},{"xstream":11}],3:[function(require,module,exports){
"use strict";
var base_1 = require('@cycle/base');
var xstream_adapter_1 = require('@cycle/xstream-adapter');
/**
 * Takes a `main` function and circularly connects it to the given collection
 * of driver functions.
 *
 * **Example:**
 * ```js
 * import {run} from '@cycle/xstream-run';
 * const dispose = run(main, drivers);
 * // ...
 * dispose();
 * ```
 *
 * The `main` function expects a collection of "source" streams (returned from
 * drivers) as input, and should return a collection of "sink" streams (to be
 * given to drivers). A "collection of streams" is a JavaScript object where
 * keys match the driver names registered by the `drivers` object, and values
 * are the streams. Refer to the documentation of each driver to see more
 * details on what types of sources it outputs and sinks it receives.
 *
 * @param {Function} main a function that takes `sources` as input and outputs
 * `sinks`.
 * @param {Object} drivers an object where keys are driver names and values
 * are driver functions.
 * @return {Function} a dispose function, used to terminate the execution of the
 * Cycle.js program, cleaning up resources used.
 * @function run
 */
function run(main, drivers) {
    var _a = base_1.default(main, drivers, { streamAdapter: xstream_adapter_1.default }), run = _a.run, sinks = _a.sinks;
    if (typeof window !== 'undefined' && window['CyclejsDevTool_startGraphSerializer']) {
        window['CyclejsDevTool_startGraphSerializer'](sinks);
    }
    return run();
}
exports.run = run;
/**
 * A function that prepares the Cycle application to be executed. Takes a `main`
 * function and prepares to circularly connects it to the given collection of
 * driver functions. As an output, `Cycle()` returns an object with three
 * properties: `sources`, `sinks` and `run`. Only when `run()` is called will
 * the application actually execute. Refer to the documentation of `run()` for
 * more details.
 *
 * **Example:**
 * ```js
 * import Cycle from '@cycle/xstream-run';
 * const {sources, sinks, run} = Cycle(main, drivers);
 * // ...
 * const dispose = run(); // Executes the application
 * // ...
 * dispose();
 * ```
 *
 * @param {Function} main a function that takes `sources` as input and outputs
 * `sinks`.
 * @param {Object} drivers an object where keys are driver names and values
 * are driver functions.
 * @return {Object} an object with three properties: `sources`, `sinks` and
 * `run`. `sources` is the collection of driver sources, `sinks` is the
 * collection of driver sinks, these can be used for debugging or testing. `run`
 * is the function that once called will execute the application.
 * @function Cycle
 */
var Cycle = function (main, drivers) {
    var out = base_1.default(main, drivers, { streamAdapter: xstream_adapter_1.default });
    if (typeof window !== 'undefined' && window['CyclejsDevTool_startGraphSerializer']) {
        window['CyclejsDevTool_startGraphSerializer'](out.sinks);
    }
    return out;
};
Cycle.run = run;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Cycle;

},{"@cycle/base":1,"@cycle/xstream-adapter":2}],4:[function(require,module,exports){
module.exports = require('./lib/index');

},{"./lib/index":5}],5:[function(require,module,exports){
(function (global){
'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _ponyfill = require('./ponyfill');

var _ponyfill2 = _interopRequireDefault(_ponyfill);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var root = undefined; /* global window */

if (typeof global !== 'undefined') {
	root = global;
} else if (typeof window !== 'undefined') {
	root = window;
}

var result = (0, _ponyfill2['default'])(root);
exports['default'] = result;
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./ponyfill":6}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports['default'] = symbolObservablePonyfill;
function symbolObservablePonyfill(root) {
	var result;
	var _Symbol = root.Symbol;

	if (typeof _Symbol === 'function') {
		if (_Symbol.observable) {
			result = _Symbol.observable;
		} else {
			result = _Symbol('observable');
			_Symbol.observable = result;
		}
	} else {
		result = '@@observable';
	}

	return result;
};
},{}],7:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var symbol_observable_1 = require('symbol-observable');
var NO = {};
function noop() { }
function copy(a) {
    var l = a.length;
    var b = Array(l);
    for (var i = 0; i < l; ++i) {
        b[i] = a[i];
    }
    return b;
}
exports.NO_IL = {
    _n: noop,
    _e: noop,
    _c: noop,
};
// mutates the input
function internalizeProducer(producer) {
    producer._start =
        function _start(il) {
            il.next = il._n;
            il.error = il._e;
            il.complete = il._c;
            this.start(il);
        };
    producer._stop = producer.stop;
}
function compose2(f1, f2) {
    return function composedFn(arg) {
        return f1(f2(arg));
    };
}
function and(f1, f2) {
    return function andFn(t) {
        return f1(t) && f2(t);
    };
}
var Subscription = (function () {
    function Subscription(_stream, _listener) {
        this._stream = _stream;
        this._listener = _listener;
    }
    Subscription.prototype.unsubscribe = function () {
        this._stream.removeListener(this._listener);
    };
    return Subscription;
}());
exports.Subscription = Subscription;
var ObservableProducer = (function () {
    function ObservableProducer(observable) {
        this.type = 'fromObservable';
        this.ins = observable;
    }
    ObservableProducer.prototype._start = function (out) {
        this.out = out;
        this._subscription = this.ins.subscribe(new ObservableListener(out));
    };
    ObservableProducer.prototype._stop = function () {
        this._subscription.unsubscribe();
    };
    return ObservableProducer;
}());
var ObservableListener = (function () {
    function ObservableListener(_listener) {
        this._listener = _listener;
    }
    ObservableListener.prototype.next = function (value) {
        this._listener._n(value);
    };
    ObservableListener.prototype.error = function (err) {
        this._listener._e(err);
    };
    ObservableListener.prototype.complete = function () {
        this._listener._c();
    };
    return ObservableListener;
}());
var MergeProducer = (function () {
    function MergeProducer(insArr) {
        this.type = 'merge';
        this.insArr = insArr;
        this.out = NO;
        this.ac = 0;
    }
    MergeProducer.prototype._start = function (out) {
        this.out = out;
        var s = this.insArr;
        var L = s.length;
        this.ac = L;
        for (var i = 0; i < L; i++) {
            s[i]._add(this);
        }
    };
    MergeProducer.prototype._stop = function () {
        var s = this.insArr;
        var L = s.length;
        for (var i = 0; i < L; i++) {
            s[i]._remove(this);
        }
        this.out = NO;
    };
    MergeProducer.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    MergeProducer.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    MergeProducer.prototype._c = function () {
        if (--this.ac <= 0) {
            var u = this.out;
            if (u === NO)
                return;
            u._c();
        }
    };
    return MergeProducer;
}());
exports.MergeProducer = MergeProducer;
var CombineListener = (function () {
    function CombineListener(i, out, p) {
        this.i = i;
        this.out = out;
        this.p = p;
        p.ils.push(this);
    }
    CombineListener.prototype._n = function (t) {
        var p = this.p, out = this.out;
        if (!out)
            return;
        if (p.up(t, this.i)) {
            out._n(p.vals);
        }
    };
    CombineListener.prototype._e = function (err) {
        var out = this.out;
        if (!out)
            return;
        out._e(err);
    };
    CombineListener.prototype._c = function () {
        var p = this.p;
        if (!p.out)
            return;
        if (--p.Nc === 0) {
            p.out._c();
        }
    };
    return CombineListener;
}());
exports.CombineListener = CombineListener;
var CombineProducer = (function () {
    function CombineProducer(insArr) {
        this.type = 'combine';
        this.insArr = insArr;
        this.out = NO;
        this.ils = [];
        this.Nc = this.Nn = 0;
        this.vals = [];
    }
    CombineProducer.prototype.up = function (t, i) {
        var v = this.vals[i];
        var Nn = !this.Nn ? 0 : v === NO ? --this.Nn : this.Nn;
        this.vals[i] = t;
        return Nn === 0;
    };
    CombineProducer.prototype._start = function (out) {
        this.out = out;
        var s = this.insArr;
        var n = this.Nc = this.Nn = s.length;
        var vals = this.vals = new Array(n);
        if (n === 0) {
            out._n([]);
            out._c();
        }
        else {
            for (var i = 0; i < n; i++) {
                vals[i] = NO;
                s[i]._add(new CombineListener(i, out, this));
            }
        }
    };
    CombineProducer.prototype._stop = function () {
        var s = this.insArr;
        var n = s.length;
        for (var i = 0; i < n; i++) {
            s[i]._remove(this.ils[i]);
        }
        this.out = NO;
        this.ils = [];
        this.vals = [];
    };
    return CombineProducer;
}());
exports.CombineProducer = CombineProducer;
var FromArrayProducer = (function () {
    function FromArrayProducer(a) {
        this.type = 'fromArray';
        this.a = a;
    }
    FromArrayProducer.prototype._start = function (out) {
        var a = this.a;
        for (var i = 0, l = a.length; i < l; i++) {
            out._n(a[i]);
        }
        out._c();
    };
    FromArrayProducer.prototype._stop = function () {
    };
    return FromArrayProducer;
}());
exports.FromArrayProducer = FromArrayProducer;
var FromPromiseProducer = (function () {
    function FromPromiseProducer(p) {
        this.type = 'fromPromise';
        this.on = false;
        this.p = p;
    }
    FromPromiseProducer.prototype._start = function (out) {
        var prod = this;
        this.on = true;
        this.p.then(function (v) {
            if (prod.on) {
                out._n(v);
                out._c();
            }
        }, function (e) {
            out._e(e);
        }).then(null, function (err) {
            setTimeout(function () { throw err; });
        });
    };
    FromPromiseProducer.prototype._stop = function () {
        this.on = false;
    };
    return FromPromiseProducer;
}());
exports.FromPromiseProducer = FromPromiseProducer;
var PeriodicProducer = (function () {
    function PeriodicProducer(period) {
        this.type = 'periodic';
        this.period = period;
        this.intervalID = -1;
        this.i = 0;
    }
    PeriodicProducer.prototype._start = function (stream) {
        var self = this;
        function intervalHandler() { stream._n(self.i++); }
        this.intervalID = setInterval(intervalHandler, this.period);
    };
    PeriodicProducer.prototype._stop = function () {
        if (this.intervalID !== -1)
            clearInterval(this.intervalID);
        this.intervalID = -1;
        this.i = 0;
    };
    return PeriodicProducer;
}());
exports.PeriodicProducer = PeriodicProducer;
var DebugOperator = (function () {
    function DebugOperator(arg, ins) {
        this.type = 'debug';
        this.ins = ins;
        this.out = NO;
        this.s = noop;
        this.l = '';
        if (typeof arg === 'string') {
            this.l = arg;
        }
        else if (typeof arg === 'function') {
            this.s = arg;
        }
    }
    DebugOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    DebugOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    DebugOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        var s = this.s, l = this.l;
        if (s !== noop) {
            try {
                s(t);
            }
            catch (e) {
                u._e(e);
            }
        }
        else if (l) {
            console.log(l + ':', t);
        }
        else {
            console.log(t);
        }
        u._n(t);
    };
    DebugOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    DebugOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return DebugOperator;
}());
exports.DebugOperator = DebugOperator;
var DropOperator = (function () {
    function DropOperator(max, ins) {
        this.type = 'drop';
        this.ins = ins;
        this.out = NO;
        this.max = max;
        this.dropped = 0;
    }
    DropOperator.prototype._start = function (out) {
        this.out = out;
        this.dropped = 0;
        this.ins._add(this);
    };
    DropOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    DropOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        if (this.dropped++ >= this.max)
            u._n(t);
    };
    DropOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    DropOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return DropOperator;
}());
exports.DropOperator = DropOperator;
var OtherIL = (function () {
    function OtherIL(out, op) {
        this.out = out;
        this.op = op;
    }
    OtherIL.prototype._n = function (t) {
        this.op.end();
    };
    OtherIL.prototype._e = function (err) {
        this.out._e(err);
    };
    OtherIL.prototype._c = function () {
        this.op.end();
    };
    return OtherIL;
}());
var EndWhenOperator = (function () {
    function EndWhenOperator(o, ins) {
        this.type = 'endWhen';
        this.ins = ins;
        this.out = NO;
        this.o = o;
        this.oil = exports.NO_IL;
    }
    EndWhenOperator.prototype._start = function (out) {
        this.out = out;
        this.o._add(this.oil = new OtherIL(out, this));
        this.ins._add(this);
    };
    EndWhenOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.o._remove(this.oil);
        this.out = NO;
        this.oil = exports.NO_IL;
    };
    EndWhenOperator.prototype.end = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    EndWhenOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    EndWhenOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    EndWhenOperator.prototype._c = function () {
        this.end();
    };
    return EndWhenOperator;
}());
exports.EndWhenOperator = EndWhenOperator;
var FilterOperator = (function () {
    function FilterOperator(passes, ins) {
        this.type = 'filter';
        this.ins = ins;
        this.out = NO;
        this.passes = passes;
    }
    FilterOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    FilterOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    FilterOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        try {
            if (this.passes(t))
                u._n(t);
        }
        catch (e) {
            u._e(e);
        }
    };
    FilterOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    FilterOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return FilterOperator;
}());
exports.FilterOperator = FilterOperator;
var FlattenListener = (function () {
    function FlattenListener(out, op) {
        this.out = out;
        this.op = op;
    }
    FlattenListener.prototype._n = function (t) {
        this.out._n(t);
    };
    FlattenListener.prototype._e = function (err) {
        this.out._e(err);
    };
    FlattenListener.prototype._c = function () {
        this.op.inner = NO;
        this.op.less();
    };
    return FlattenListener;
}());
var FlattenOperator = (function () {
    function FlattenOperator(ins) {
        this.type = 'flatten';
        this.ins = ins;
        this.out = NO;
        this.open = true;
        this.inner = NO;
        this.il = exports.NO_IL;
    }
    FlattenOperator.prototype._start = function (out) {
        this.out = out;
        this.open = true;
        this.inner = NO;
        this.il = exports.NO_IL;
        this.ins._add(this);
    };
    FlattenOperator.prototype._stop = function () {
        this.ins._remove(this);
        if (this.inner !== NO)
            this.inner._remove(this.il);
        this.out = NO;
        this.open = true;
        this.inner = NO;
        this.il = exports.NO_IL;
    };
    FlattenOperator.prototype.less = function () {
        var u = this.out;
        if (u === NO)
            return;
        if (!this.open && this.inner === NO)
            u._c();
    };
    FlattenOperator.prototype._n = function (s) {
        var u = this.out;
        if (u === NO)
            return;
        var _a = this, inner = _a.inner, il = _a.il;
        if (inner !== NO && il !== exports.NO_IL)
            inner._remove(il);
        (this.inner = s)._add(this.il = new FlattenListener(u, this));
    };
    FlattenOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    FlattenOperator.prototype._c = function () {
        this.open = false;
        this.less();
    };
    return FlattenOperator;
}());
exports.FlattenOperator = FlattenOperator;
var FoldOperator = (function () {
    function FoldOperator(f, seed, ins) {
        this.type = 'fold';
        this.ins = ins;
        this.out = NO;
        this.f = f;
        this.acc = this.seed = seed;
    }
    FoldOperator.prototype._start = function (out) {
        this.out = out;
        this.acc = this.seed;
        out._n(this.acc);
        this.ins._add(this);
    };
    FoldOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
        this.acc = this.seed;
    };
    FoldOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        try {
            u._n(this.acc = this.f(this.acc, t));
        }
        catch (e) {
            u._e(e);
        }
    };
    FoldOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    FoldOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return FoldOperator;
}());
exports.FoldOperator = FoldOperator;
var LastOperator = (function () {
    function LastOperator(ins) {
        this.type = 'last';
        this.ins = ins;
        this.out = NO;
        this.has = false;
        this.val = NO;
    }
    LastOperator.prototype._start = function (out) {
        this.out = out;
        this.has = false;
        this.ins._add(this);
    };
    LastOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
        this.val = NO;
    };
    LastOperator.prototype._n = function (t) {
        this.has = true;
        this.val = t;
    };
    LastOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    LastOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        if (this.has) {
            u._n(this.val);
            u._c();
        }
        else {
            u._e('TODO show proper error');
        }
    };
    return LastOperator;
}());
exports.LastOperator = LastOperator;
var MapFlattenInner = (function () {
    function MapFlattenInner(out, op) {
        this.out = out;
        this.op = op;
    }
    MapFlattenInner.prototype._n = function (r) {
        this.out._n(r);
    };
    MapFlattenInner.prototype._e = function (err) {
        this.out._e(err);
    };
    MapFlattenInner.prototype._c = function () {
        this.op.inner = NO;
        this.op.less();
    };
    return MapFlattenInner;
}());
var MapFlattenOperator = (function () {
    function MapFlattenOperator(mapOp) {
        this.type = mapOp.type + "+flatten";
        this.ins = mapOp.ins;
        this.out = NO;
        this.mapOp = mapOp;
        this.inner = NO;
        this.il = exports.NO_IL;
        this.open = true;
    }
    MapFlattenOperator.prototype._start = function (out) {
        this.out = out;
        this.inner = NO;
        this.il = exports.NO_IL;
        this.open = true;
        this.mapOp.ins._add(this);
    };
    MapFlattenOperator.prototype._stop = function () {
        this.mapOp.ins._remove(this);
        if (this.inner !== NO)
            this.inner._remove(this.il);
        this.out = NO;
        this.inner = NO;
        this.il = exports.NO_IL;
    };
    MapFlattenOperator.prototype.less = function () {
        if (!this.open && this.inner === NO) {
            var u = this.out;
            if (u === NO)
                return;
            u._c();
        }
    };
    MapFlattenOperator.prototype._n = function (v) {
        var u = this.out;
        if (u === NO)
            return;
        var _a = this, inner = _a.inner, il = _a.il;
        var s;
        try {
            s = this.mapOp.project(v);
        }
        catch (e) {
            u._e(e);
            return;
        }
        if (inner !== NO && il !== exports.NO_IL)
            inner._remove(il);
        (this.inner = s)._add(this.il = new MapFlattenInner(u, this));
    };
    MapFlattenOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    MapFlattenOperator.prototype._c = function () {
        this.open = false;
        this.less();
    };
    return MapFlattenOperator;
}());
exports.MapFlattenOperator = MapFlattenOperator;
var MapOperator = (function () {
    function MapOperator(project, ins) {
        this.type = 'map';
        this.ins = ins;
        this.out = NO;
        this.project = project;
    }
    MapOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    MapOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    MapOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        try {
            u._n(this.project(t));
        }
        catch (e) {
            u._e(e);
        }
    };
    MapOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    MapOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return MapOperator;
}());
exports.MapOperator = MapOperator;
var FilterMapOperator = (function (_super) {
    __extends(FilterMapOperator, _super);
    function FilterMapOperator(passes, project, ins) {
        _super.call(this, project, ins);
        this.type = 'filter+map';
        this.passes = passes;
    }
    FilterMapOperator.prototype._n = function (v) {
        if (this.passes(v)) {
            _super.prototype._n.call(this, v);
        }
        ;
    };
    return FilterMapOperator;
}(MapOperator));
exports.FilterMapOperator = FilterMapOperator;
var RememberOperator = (function () {
    function RememberOperator(ins) {
        this.type = 'remember';
        this.ins = ins;
        this.out = NO;
    }
    RememberOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(out);
    };
    RememberOperator.prototype._stop = function () {
        this.ins._remove(this.out);
        this.out = NO;
    };
    return RememberOperator;
}());
exports.RememberOperator = RememberOperator;
var ReplaceErrorOperator = (function () {
    function ReplaceErrorOperator(fn, ins) {
        this.type = 'replaceError';
        this.ins = ins;
        this.out = NO;
        this.fn = fn;
    }
    ReplaceErrorOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    ReplaceErrorOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    ReplaceErrorOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        u._n(t);
    };
    ReplaceErrorOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        try {
            this.ins._remove(this);
            (this.ins = this.fn(err))._add(this);
        }
        catch (e) {
            u._e(e);
        }
    };
    ReplaceErrorOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return ReplaceErrorOperator;
}());
exports.ReplaceErrorOperator = ReplaceErrorOperator;
var StartWithOperator = (function () {
    function StartWithOperator(ins, val) {
        this.type = 'startWith';
        this.ins = ins;
        this.out = NO;
        this.val = val;
    }
    StartWithOperator.prototype._start = function (out) {
        this.out = out;
        this.out._n(this.val);
        this.ins._add(out);
    };
    StartWithOperator.prototype._stop = function () {
        this.ins._remove(this.out);
        this.out = NO;
    };
    return StartWithOperator;
}());
exports.StartWithOperator = StartWithOperator;
var TakeOperator = (function () {
    function TakeOperator(max, ins) {
        this.type = 'take';
        this.ins = ins;
        this.out = NO;
        this.max = max;
        this.taken = 0;
    }
    TakeOperator.prototype._start = function (out) {
        this.out = out;
        this.taken = 0;
        if (this.max <= 0) {
            out._c();
        }
        else {
            this.ins._add(this);
        }
    };
    TakeOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = NO;
    };
    TakeOperator.prototype._n = function (t) {
        var u = this.out;
        if (u === NO)
            return;
        if (this.taken++ < this.max - 1) {
            u._n(t);
        }
        else {
            u._n(t);
            u._c();
        }
    };
    TakeOperator.prototype._e = function (err) {
        var u = this.out;
        if (u === NO)
            return;
        u._e(err);
    };
    TakeOperator.prototype._c = function () {
        var u = this.out;
        if (u === NO)
            return;
        u._c();
    };
    return TakeOperator;
}());
exports.TakeOperator = TakeOperator;
var Stream = (function () {
    function Stream(producer) {
        this._prod = producer || NO;
        this._ils = [];
        this._stopID = NO;
        this._dl = NO;
        this._d = false;
        this._target = NO;
        this._err = NO;
    }
    Stream.prototype._n = function (t) {
        var a = this._ils;
        var L = a.length;
        if (this._d)
            this._dl._n(t);
        if (L == 1)
            a[0]._n(t);
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._n(t);
        }
    };
    Stream.prototype._e = function (err) {
        if (this._err !== NO)
            return;
        this._err = err;
        var a = this._ils;
        var L = a.length;
        this._x();
        if (this._d)
            this._dl._e(err);
        if (L == 1)
            a[0]._e(err);
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._e(err);
        }
    };
    Stream.prototype._c = function () {
        var a = this._ils;
        var L = a.length;
        this._x();
        if (this._d)
            this._dl._c();
        if (L == 1)
            a[0]._c();
        else {
            var b = copy(a);
            for (var i = 0; i < L; i++)
                b[i]._c();
        }
    };
    Stream.prototype._x = function () {
        if (this._ils.length === 0)
            return;
        if (this._prod !== NO)
            this._prod._stop();
        this._err = NO;
        this._ils = [];
    };
    Stream.prototype._stopNow = function () {
        // WARNING: code that calls this method should
        // first check if this._prod is valid (not `NO`)
        this._prod._stop();
        this._err = NO;
        this._stopID = NO;
    };
    Stream.prototype._add = function (il) {
        var ta = this._target;
        if (ta !== NO)
            return ta._add(il);
        var a = this._ils;
        a.push(il);
        if (a.length > 1)
            return;
        if (this._stopID !== NO) {
            clearTimeout(this._stopID);
            this._stopID = NO;
        }
        else {
            var p = this._prod;
            if (p !== NO)
                p._start(this);
        }
    };
    Stream.prototype._remove = function (il) {
        var _this = this;
        var ta = this._target;
        if (ta !== NO)
            return ta._remove(il);
        var a = this._ils;
        var i = a.indexOf(il);
        if (i > -1) {
            a.splice(i, 1);
            if (this._prod !== NO && a.length <= 0) {
                this._err = NO;
                this._stopID = setTimeout(function () { return _this._stopNow(); });
            }
            else if (a.length === 1) {
                this._pruneCycles();
            }
        }
    };
    // If all paths stemming from `this` stream eventually end at `this`
    // stream, then we remove the single listener of `this` stream, to
    // force it to end its execution and dispose resources. This method
    // assumes as a precondition that this._ils has just one listener.
    Stream.prototype._pruneCycles = function () {
        if (this._hasNoSinks(this, [])) {
            this._remove(this._ils[0]);
        }
    };
    // Checks whether *there is no* path starting from `x` that leads to an end
    // listener (sink) in the stream graph, following edges A->B where B is a
    // listener of A. This means these paths constitute a cycle somehow. Is given
    // a trace of all visited nodes so far.
    Stream.prototype._hasNoSinks = function (x, trace) {
        if (trace.indexOf(x) !== -1) {
            return true;
        }
        else if (x.out === this) {
            return true;
        }
        else if (x.out && x.out !== NO) {
            return this._hasNoSinks(x.out, trace.concat(x));
        }
        else if (x._ils) {
            for (var i = 0, N = x._ils.length; i < N; i++) {
                if (!this._hasNoSinks(x._ils[i], trace.concat(x))) {
                    return false;
                }
            }
            return true;
        }
        else {
            return false;
        }
    };
    Stream.prototype.ctor = function () {
        return this instanceof MemoryStream ? MemoryStream : Stream;
    };
    /**
     * Adds a Listener to the Stream.
     *
     * @param {Listener<T>} listener
     */
    Stream.prototype.addListener = function (listener) {
        if (typeof listener.next !== 'function'
            || typeof listener.error !== 'function'
            || typeof listener.complete !== 'function') {
            throw new Error('stream.addListener() requires all three next, error, ' +
                'and complete functions.');
        }
        listener._n = listener.next;
        listener._e = listener.error;
        listener._c = listener.complete;
        this._add(listener);
    };
    /**
     * Removes a Listener from the Stream, assuming the Listener was added to it.
     *
     * @param {Listener<T>} listener
     */
    Stream.prototype.removeListener = function (listener) {
        this._remove(listener);
    };
    /**
     * Adds a Listener to the Stream returning a Subscription to remove that
     * listener.
     *
     * @param {Listener} listener
     * @returns {Subscription}
     */
    Stream.prototype.subscribe = function (listener) {
        this.addListener(listener);
        return new Subscription(this, listener);
    };
    /**
     * Add interop between most.js and RxJS 5
     *
     * @returns {Stream}
     */
    Stream.prototype[symbol_observable_1.default] = function () {
        return this;
    };
    /**
     * Creates a new Stream given a Producer.
     *
     * @factory true
     * @param {Producer} producer An optional Producer that dictates how to
     * start, generate events, and stop the Stream.
     * @return {Stream}
     */
    Stream.create = function (producer) {
        if (producer) {
            if (typeof producer.start !== 'function'
                || typeof producer.stop !== 'function') {
                throw new Error('producer requires both start and stop functions');
            }
            internalizeProducer(producer); // mutates the input
        }
        return new Stream(producer);
    };
    /**
     * Creates a new MemoryStream given a Producer.
     *
     * @factory true
     * @param {Producer} producer An optional Producer that dictates how to
     * start, generate events, and stop the Stream.
     * @return {MemoryStream}
     */
    Stream.createWithMemory = function (producer) {
        if (producer) {
            internalizeProducer(producer); // mutates the input
        }
        return new MemoryStream(producer);
    };
    /**
     * Creates a Stream that does nothing when started. It never emits any event.
     *
     * Marble diagram:
     *
     * ```text
     *          never
     * -----------------------
     * ```
     *
     * @factory true
     * @return {Stream}
     */
    Stream.never = function () {
        return new Stream({ _start: noop, _stop: noop });
    };
    /**
     * Creates a Stream that immediately emits the "complete" notification when
     * started, and that's it.
     *
     * Marble diagram:
     *
     * ```text
     * empty
     * -|
     * ```
     *
     * @factory true
     * @return {Stream}
     */
    Stream.empty = function () {
        return new Stream({
            _start: function (il) { il._c(); },
            _stop: noop,
        });
    };
    /**
     * Creates a Stream that immediately emits an "error" notification with the
     * value you passed as the `error` argument when the stream starts, and that's
     * it.
     *
     * Marble diagram:
     *
     * ```text
     * throw(X)
     * -X
     * ```
     *
     * @factory true
     * @param error The error event to emit on the created stream.
     * @return {Stream}
     */
    Stream.throw = function (error) {
        return new Stream({
            _start: function (il) { il._e(error); },
            _stop: noop,
        });
    };
    /**
     * Creates a stream from an Array, Promise, or an Observable.
     *
     * @factory true
     * @param {Array|Promise|Observable} input The input to make a stream from.
     * @return {Stream}
     */
    Stream.from = function (input) {
        if (typeof input[symbol_observable_1.default] === 'function') {
            return Stream.fromObservable(input);
        }
        else if (typeof input.then === 'function') {
            return Stream.fromPromise(input);
        }
        else if (Array.isArray(input)) {
            return Stream.fromArray(input);
        }
        throw new TypeError("Type of input to from() must be an Array, Promise, or Observable");
    };
    /**
     * Creates a Stream that immediately emits the arguments that you give to
     * *of*, then completes.
     *
     * Marble diagram:
     *
     * ```text
     * of(1,2,3)
     * 123|
     * ```
     *
     * @factory true
     * @param a The first value you want to emit as an event on the stream.
     * @param b The second value you want to emit as an event on the stream. One
     * or more of these values may be given as arguments.
     * @return {Stream}
     */
    Stream.of = function () {
        var items = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            items[_i - 0] = arguments[_i];
        }
        return Stream.fromArray(items);
    };
    /**
     * Converts an array to a stream. The returned stream will emit synchronously
     * all the items in the array, and then complete.
     *
     * Marble diagram:
     *
     * ```text
     * fromArray([1,2,3])
     * 123|
     * ```
     *
     * @factory true
     * @param {Array} array The array to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromArray = function (array) {
        return new Stream(new FromArrayProducer(array));
    };
    /**
     * Converts a promise to a stream. The returned stream will emit the resolved
     * value of the promise, and then complete. However, if the promise is
     * rejected, the stream will emit the corresponding error.
     *
     * Marble diagram:
     *
     * ```text
     * fromPromise( ----42 )
     * -----------------42|
     * ```
     *
     * @factory true
     * @param {Promise} promise The promise to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromPromise = function (promise) {
        return new Stream(new FromPromiseProducer(promise));
    };
    /**
     * Converts an Observable into a Stream.
     *
     * @factory true
     * @param {any} observable The observable to be converted as a stream.
     * @return {Stream}
     */
    Stream.fromObservable = function (observable) {
        return new Stream(new ObservableProducer(observable));
    };
    /**
     * Creates a stream that periodically emits incremental numbers, every
     * `period` milliseconds.
     *
     * Marble diagram:
     *
     * ```text
     *     periodic(1000)
     * ---0---1---2---3---4---...
     * ```
     *
     * @factory true
     * @param {number} period The interval in milliseconds to use as a rate of
     * emission.
     * @return {Stream}
     */
    Stream.periodic = function (period) {
        return new Stream(new PeriodicProducer(period));
    };
    Stream.prototype._map = function (project) {
        var p = this._prod;
        var ctor = this.ctor();
        if (p instanceof FilterOperator) {
            return new ctor(new FilterMapOperator(p.passes, project, p.ins));
        }
        if (p instanceof FilterMapOperator) {
            return new ctor(new FilterMapOperator(p.passes, compose2(project, p.project), p.ins));
        }
        if (p instanceof MapOperator) {
            return new ctor(new MapOperator(compose2(project, p.project), p.ins));
        }
        return new ctor(new MapOperator(project, this));
    };
    /**
     * Transforms each event from the input Stream through a `project` function,
     * to get a Stream that emits those transformed events.
     *
     * Marble diagram:
     *
     * ```text
     * --1---3--5-----7------
     *    map(i => i * 10)
     * --10--30-50----70-----
     * ```
     *
     * @param {Function} project A function of type `(t: T) => U` that takes event
     * `t` of type `T` from the input Stream and produces an event of type `U`, to
     * be emitted on the output Stream.
     * @return {Stream}
     */
    Stream.prototype.map = function (project) {
        return this._map(project);
    };
    /**
     * It's like `map`, but transforms each input event to always the same
     * constant value on the output Stream.
     *
     * Marble diagram:
     *
     * ```text
     * --1---3--5-----7-----
     *       mapTo(10)
     * --10--10-10----10----
     * ```
     *
     * @param projectedValue A value to emit on the output Stream whenever the
     * input Stream emits any value.
     * @return {Stream}
     */
    Stream.prototype.mapTo = function (projectedValue) {
        var s = this.map(function () { return projectedValue; });
        var op = s._prod;
        op.type = op.type.replace('map', 'mapTo');
        return s;
    };
    /**
     * Only allows events that pass the test given by the `passes` argument.
     *
     * Each event from the input stream is given to the `passes` function. If the
     * function returns `true`, the event is forwarded to the output stream,
     * otherwise it is ignored and not forwarded.
     *
     * Marble diagram:
     *
     * ```text
     * --1---2--3-----4-----5---6--7-8--
     *     filter(i => i % 2 === 0)
     * ------2--------4---------6----8--
     * ```
     *
     * @param {Function} passes A function of type `(t: T) +> boolean` that takes
     * an event from the input stream and checks if it passes, by returning a
     * boolean.
     * @return {Stream}
     */
    Stream.prototype.filter = function (passes) {
        var p = this._prod;
        if (p instanceof FilterOperator) {
            return new Stream(new FilterOperator(and(p.passes, passes), p.ins));
        }
        return new Stream(new FilterOperator(passes, this));
    };
    /**
     * Lets the first `amount` many events from the input stream pass to the
     * output stream, then makes the output stream complete.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c----d---e--
     *    take(3)
     * --a---b--c|
     * ```
     *
     * @param {number} amount How many events to allow from the input stream
     * before completing the output stream.
     * @return {Stream}
     */
    Stream.prototype.take = function (amount) {
        return new (this.ctor())(new TakeOperator(amount, this));
    };
    /**
     * Ignores the first `amount` many events from the input stream, and then
     * after that starts forwarding events from the input stream to the output
     * stream.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c----d---e--
     *       drop(3)
     * --------------d---e--
     * ```
     *
     * @param {number} amount How many events to ignore from the input stream
     * before forwarding all events from the input stream to the output stream.
     * @return {Stream}
     */
    Stream.prototype.drop = function (amount) {
        return new Stream(new DropOperator(amount, this));
    };
    /**
     * When the input stream completes, the output stream will emit the last event
     * emitted by the input stream, and then will also complete.
     *
     * Marble diagram:
     *
     * ```text
     * --a---b--c--d----|
     *       last()
     * -----------------d|
     * ```
     *
     * @return {Stream}
     */
    Stream.prototype.last = function () {
        return new Stream(new LastOperator(this));
    };
    /**
     * Prepends the given `initial` value to the sequence of events emitted by the
     * input stream. The returned stream is a MemoryStream, which means it is
     * already `remember()`'d.
     *
     * Marble diagram:
     *
     * ```text
     * ---1---2-----3---
     *   startWith(0)
     * 0--1---2-----3---
     * ```
     *
     * @param initial The value or event to prepend.
     * @return {MemoryStream}
     */
    Stream.prototype.startWith = function (initial) {
        return new MemoryStream(new StartWithOperator(this, initial));
    };
    /**
     * Uses another stream to determine when to complete the current stream.
     *
     * When the given `other` stream emits an event or completes, the output
     * stream will complete. Before that happens, the output stream will behaves
     * like the input stream.
     *
     * Marble diagram:
     *
     * ```text
     * ---1---2-----3--4----5----6---
     *   endWhen( --------a--b--| )
     * ---1---2-----3--4--|
     * ```
     *
     * @param other Some other stream that is used to know when should the output
     * stream of this operator complete.
     * @return {Stream}
     */
    Stream.prototype.endWhen = function (other) {
        return new (this.ctor())(new EndWhenOperator(other, this));
    };
    /**
     * "Folds" the stream onto itself.
     *
     * Combines events from the past throughout
     * the entire execution of the input stream, allowing you to accumulate them
     * together. It's essentially like `Array.prototype.reduce`. The returned
     * stream is a MemoryStream, which means it is already `remember()`'d.
     *
     * The output stream starts by emitting the `seed` which you give as argument.
     * Then, when an event happens on the input stream, it is combined with that
     * seed value through the `accumulate` function, and the output value is
     * emitted on the output stream. `fold` remembers that output value as `acc`
     * ("accumulator"), and then when a new input event `t` happens, `acc` will be
     * combined with that to produce the new `acc` and so forth.
     *
     * Marble diagram:
     *
     * ```text
     * ------1-----1--2----1----1------
     *   fold((acc, x) => acc + x, 3)
     * 3-----4-----5--7----8----9------
     * ```
     *
     * @param {Function} accumulate A function of type `(acc: R, t: T) => R` that
     * takes the previous accumulated value `acc` and the incoming event from the
     * input stream and produces the new accumulated value.
     * @param seed The initial accumulated value, of type `R`.
     * @return {MemoryStream}
     */
    Stream.prototype.fold = function (accumulate, seed) {
        return new MemoryStream(new FoldOperator(accumulate, seed, this));
    };
    /**
     * Replaces an error with another stream.
     *
     * When (and if) an error happens on the input stream, instead of forwarding
     * that error to the output stream, *replaceError* will call the `replace`
     * function which returns the stream that the output stream will replicate.
     * And, in case that new stream also emits an error, `replace` will be called
     * again to get another stream to start replicating.
     *
     * Marble diagram:
     *
     * ```text
     * --1---2-----3--4-----X
     *   replaceError( () => --10--| )
     * --1---2-----3--4--------10--|
     * ```
     *
     * @param {Function} replace A function of type `(err) => Stream` that takes
     * the error that occurred on the input stream or on the previous replacement
     * stream and returns a new stream. The output stream will behave like the
     * stream that this function returns.
     * @return {Stream}
     */
    Stream.prototype.replaceError = function (replace) {
        return new (this.ctor())(new ReplaceErrorOperator(replace, this));
    };
    /**
     * Flattens a "stream of streams", handling only one nested stream at a time
     * (no concurrency).
     *
     * If the input stream is a stream that emits streams, then this operator will
     * return an output stream which is a flat stream: emits regular events. The
     * flattening happens without concurrency. It works like this: when the input
     * stream emits a nested stream, *flatten* will start imitating that nested
     * one. However, as soon as the next nested stream is emitted on the input
     * stream, *flatten* will forget the previous nested one it was imitating, and
     * will start imitating the new nested one.
     *
     * Marble diagram:
     *
     * ```text
     * --+--------+---------------
     *   \        \
     *    \       ----1----2---3--
     *    --a--b----c----d--------
     *           flatten
     * -----a--b------1----2---3--
     * ```
     *
     * @return {Stream}
     */
    Stream.prototype.flatten = function () {
        var p = this._prod;
        return new Stream(p instanceof MapOperator && !(p instanceof FilterMapOperator) ?
            new MapFlattenOperator(p) :
            new FlattenOperator(this));
    };
    /**
     * Passes the input stream to a custom operator, to produce an output stream.
     *
     * *compose* is a handy way of using an existing function in a chained style.
     * Instead of writing `outStream = f(inStream)` you can write
     * `outStream = inStream.compose(f)`.
     *
     * @param {function} operator A function that takes a stream as input and
     * returns a stream as well.
     * @return {Stream}
     */
    Stream.prototype.compose = function (operator) {
        return operator(this);
    };
    /**
     * Returns an output stream that behaves like the input stream, but also
     * remembers the most recent event that happens on the input stream, so that a
     * newly added listener will immediately receive that memorised event.
     *
     * @return {MemoryStream}
     */
    Stream.prototype.remember = function () {
        return new MemoryStream(new RememberOperator(this));
    };
    /**
     * Returns an output stream that identically behaves like the input stream,
     * but also runs a `spy` function fo each event, to help you debug your app.
     *
     * *debug* takes a `spy` function as argument, and runs that for each event
     * happening on the input stream. If you don't provide the `spy` argument,
     * then *debug* will just `console.log` each event. This helps you to
     * understand the flow of events through some operator chain.
     *
     * Please note that if the output stream has no listeners, then it will not
     * start, which means `spy` will never run because no actual event happens in
     * that case.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3-----4--
     *         debug
     * --1----2-----3-----4--
     * ```
     *
     * @param {function} labelOrSpy A string to use as the label when printing
     * debug information on the console, or a 'spy' function that takes an event
     * as argument, and does not need to return anything.
     * @return {Stream}
     */
    Stream.prototype.debug = function (labelOrSpy) {
        return new (this.ctor())(new DebugOperator(labelOrSpy, this));
    };
    /**
     * *imitate* changes this current Stream to emit the same events that the
     * `other` given Stream does. This method returns nothing.
     *
     * This method exists to allow one thing: **circular dependency of streams**.
     * For instance, let's imagine that for some reason you need to create a
     * circular dependency where stream `first$` depends on stream `second$`
     * which in turn depends on `first$`:
     *
     * <!-- skip-example -->
     * ```js
     * import delay from 'xstream/extra/delay'
     *
     * var first$ = second$.map(x => x * 10).take(3);
     * var second$ = first$.map(x => x + 1).startWith(1).compose(delay(100));
     * ```
     *
     * However, that is invalid JavaScript, because `second$` is undefined
     * on the first line. This is how *imitate* can help solve it:
     *
     * ```js
     * import delay from 'xstream/extra/delay'
     *
     * var secondProxy$ = xs.create();
     * var first$ = secondProxy$.map(x => x * 10).take(3);
     * var second$ = first$.map(x => x + 1).startWith(1).compose(delay(100));
     * secondProxy$.imitate(second$);
     * ```
     *
     * We create `secondProxy$` before the others, so it can be used in the
     * declaration of `first$`. Then, after both `first$` and `second$` are
     * defined, we hook `secondProxy$` with `second$` with `imitate()` to tell
     * that they are "the same". `imitate` will not trigger the start of any
     * stream, it just binds `secondProxy$` and `second$` together.
     *
     * The following is an example where `imitate()` is important in Cycle.js
     * applications. A parent component contains some child components. A child
     * has an action stream which is given to the parent to define its state:
     *
     * <!-- skip-example -->
     * ```js
     * const childActionProxy$ = xs.create();
     * const parent = Parent({...sources, childAction$: childActionProxy$});
     * const childAction$ = parent.state$.map(s => s.child.action$).flatten();
     * childActionProxy$.imitate(childAction$);
     * ```
     *
     * Note, though, that **`imitate()` does not support MemoryStreams**. If we
     * would attempt to imitate a MemoryStream in a circular dependency, we would
     * either get a race condition (where the symptom would be "nothing happens")
     * or an infinite cyclic emission of values. It's useful to think about
     * MemoryStreams as cells in a spreadsheet. It doesn't make any sense to
     * define a spreadsheet cell `A1` with a formula that depends on `B1` and
     * cell `B1` defined with a formula that depends on `A1`.
     *
     * If you find yourself wanting to use `imitate()` with a
     * MemoryStream, you should rework your code around `imitate()` to use a
     * Stream instead. Look for the stream in the circular dependency that
     * represents an event stream, and that would be a candidate for creating a
     * proxy Stream which then imitates the target Stream.
     *
     * @param {Stream} target The other stream to imitate on the current one. Must
     * not be a MemoryStream.
     */
    Stream.prototype.imitate = function (target) {
        if (target instanceof MemoryStream) {
            throw new Error('A MemoryStream was given to imitate(), but it only ' +
                'supports a Stream. Read more about this restriction here: ' +
                'https://github.com/staltz/xstream#faq');
        }
        this._target = target;
        for (var ils = this._ils, N = ils.length, i = 0; i < N; i++) {
            target._add(ils[i]);
        }
        this._ils = [];
    };
    /**
     * Forces the Stream to emit the given value to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     *
     * @param value The "next" value you want to broadcast to all listeners of
     * this Stream.
     */
    Stream.prototype.shamefullySendNext = function (value) {
        this._n(value);
    };
    /**
     * Forces the Stream to emit the given error to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     *
     * @param {any} error The error you want to broadcast to all the listeners of
     * this Stream.
     */
    Stream.prototype.shamefullySendError = function (error) {
        this._e(error);
    };
    /**
     * Forces the Stream to emit the "completed" event to its listeners.
     *
     * As the name indicates, if you use this, you are most likely doing something
     * The Wrong Way. Please try to understand the reactive way before using this
     * method. Use it only when you know what you are doing.
     */
    Stream.prototype.shamefullySendComplete = function () {
        this._c();
    };
    /**
     * Adds a "debug" listener to the stream. There can only be one debug
     * listener, that's why this is 'setDebugListener'. To remove the debug
     * listener, just call setDebugListener(null).
     *
     * A debug listener is like any other listener. The only difference is that a
     * debug listener is "stealthy": its presence/absence does not trigger the
     * start/stop of the stream (or the producer inside the stream). This is
     * useful so you can inspect what is going on without changing the behavior
     * of the program. If you have an idle stream and you add a normal listener to
     * it, the stream will start executing. But if you set a debug listener on an
     * idle stream, it won't start executing (not until the first normal listener
     * is added).
     *
     * As the name indicates, we don't recommend using this method to build app
     * logic. In fact, in most cases the debug operator works just fine. Only use
     * this one if you know what you're doing.
     *
     * @param {Listener<T>} listener
     */
    Stream.prototype.setDebugListener = function (listener) {
        if (!listener) {
            this._d = false;
            this._dl = NO;
        }
        else {
            this._d = true;
            listener._n = listener.next;
            listener._e = listener.error;
            listener._c = listener.complete;
            this._dl = listener;
        }
    };
    /**
     * Blends multiple streams together, emitting events from all of them
     * concurrently.
     *
     * *merge* takes multiple streams as arguments, and creates a stream that
     * behaves like each of the argument streams, in parallel.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3--------4---
     * ----a-----b----c---d------
     *            merge
     * --1-a--2--b--3-c---d--4---
     * ```
     *
     * @factory true
     * @param {Stream} stream1 A stream to merge together with other streams.
     * @param {Stream} stream2 A stream to merge together with other streams. Two
     * or more streams may be given as arguments.
     * @return {Stream}
     */
    Stream.merge = function merge() {
        var streams = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            streams[_i - 0] = arguments[_i];
        }
        return new Stream(new MergeProducer(streams));
    };
    /**
     * Combines multiple input streams together to return a stream whose events
     * are arrays that collect the latest events from each input stream.
     *
     * *combine* internally remembers the most recent event from each of the input
     * streams. When any of the input streams emits an event, that event together
     * with all the other saved events are combined into an array. That array will
     * be emitted on the output stream. It's essentially a way of joining together
     * the events from multiple streams.
     *
     * Marble diagram:
     *
     * ```text
     * --1----2-----3--------4---
     * ----a-----b-----c--d------
     *          combine
     * ----1a-2a-2b-3b-3c-3d-4d--
     * ```
     *
     * @factory true
     * @param {Stream} stream1 A stream to combine together with other streams.
     * @param {Stream} stream2 A stream to combine together with other streams.
     * Multiple streams, not just two, may be given as arguments.
     * @return {Stream}
     */
    Stream.combine = function combine() {
        var streams = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            streams[_i - 0] = arguments[_i];
        }
        return new Stream(new CombineProducer(streams));
    };
    return Stream;
}());
exports.Stream = Stream;
var MemoryStream = (function (_super) {
    __extends(MemoryStream, _super);
    function MemoryStream(producer) {
        _super.call(this, producer);
        this._has = false;
    }
    MemoryStream.prototype._n = function (x) {
        this._v = x;
        this._has = true;
        _super.prototype._n.call(this, x);
    };
    MemoryStream.prototype._add = function (il) {
        if (this._has) {
            il._n(this._v);
        }
        _super.prototype._add.call(this, il);
    };
    MemoryStream.prototype._stopNow = function () {
        this._has = false;
        _super.prototype._stopNow.call(this);
    };
    MemoryStream.prototype._x = function () {
        this._has = false;
        _super.prototype._x.call(this);
    };
    MemoryStream.prototype.map = function (project) {
        return this._map(project);
    };
    MemoryStream.prototype.mapTo = function (projectedValue) {
        return _super.prototype.mapTo.call(this, projectedValue);
    };
    MemoryStream.prototype.take = function (amount) {
        return _super.prototype.take.call(this, amount);
    };
    MemoryStream.prototype.endWhen = function (other) {
        return _super.prototype.endWhen.call(this, other);
    };
    MemoryStream.prototype.replaceError = function (replace) {
        return _super.prototype.replaceError.call(this, replace);
    };
    MemoryStream.prototype.remember = function () {
        return this;
    };
    MemoryStream.prototype.debug = function (labelOrSpy) {
        return _super.prototype.debug.call(this, labelOrSpy);
    };
    return MemoryStream;
}(Stream));
exports.MemoryStream = MemoryStream;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Stream;

},{"symbol-observable":4}],8:[function(require,module,exports){
"use strict";
var core_1 = require('../core');
var ConcatProducer = (function () {
    function ConcatProducer(streams) {
        this.streams = streams;
        this.type = 'concat';
        this.out = null;
        this.i = 0;
    }
    ConcatProducer.prototype._start = function (out) {
        this.out = out;
        this.streams[this.i]._add(this);
    };
    ConcatProducer.prototype._stop = function () {
        var streams = this.streams;
        if (this.i < streams.length) {
            streams[this.i]._remove(this);
        }
        this.i = 0;
        this.out = null;
    };
    ConcatProducer.prototype._n = function (t) {
        var u = this.out;
        if (!u)
            return;
        u._n(t);
    };
    ConcatProducer.prototype._e = function (err) {
        var u = this.out;
        if (!u)
            return;
        u._e(err);
    };
    ConcatProducer.prototype._c = function () {
        var u = this.out;
        if (!u)
            return;
        var streams = this.streams;
        streams[this.i]._remove(this);
        if (++this.i < streams.length) {
            streams[this.i]._add(this);
        }
        else {
            u._c();
        }
    };
    return ConcatProducer;
}());
/**
 * Puts one stream after the other. *concat* is a factory that takes multiple
 * streams as arguments, and starts the `n+1`-th stream only when the `n`-th
 * stream has completed. It concatenates those streams together.
 *
 * Marble diagram:
 *
 * ```text
 * --1--2---3---4-|
 * ...............--a-b-c--d-|
 *           concat
 * --1--2---3---4---a-b-c--d-|
 * ```
 *
 * Example:
 *
 * ```js
 * import concat from 'xstream/extra/concat'
 *
 * const streamA = xs.of('a', 'b', 'c')
 * const streamB = xs.of(10, 20, 30)
 * const streamC = xs.of('X', 'Y', 'Z')
 *
 * const outputStream = concat(streamA, streamB, streamC)
 *
 * outputStream.addListener({
 *   next: (x) => console.log(x),
 *   error: (err) => console.error(err),
 *   complete: () => console.log('concat completed'),
 * })
 * ```
 *
 * @factory true
 * @param {Stream} stream1 A stream to concatenate together with other streams.
 * @param {Stream} stream2 A stream to concatenate together with other streams. Two
 * or more streams may be given as arguments.
 * @return {Stream}
 */
function concat() {
    var streams = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        streams[_i - 0] = arguments[_i];
    }
    return new core_1.Stream(new ConcatProducer(streams));
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = concat;

},{"../core":7}],9:[function(require,module,exports){
"use strict";
var core_1 = require('../core');
var DelayOperator = (function () {
    function DelayOperator(dt, ins) {
        this.dt = dt;
        this.ins = ins;
        this.type = 'delay';
        this.out = null;
    }
    DelayOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    DelayOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.out = null;
    };
    DelayOperator.prototype._n = function (t) {
        var u = this.out;
        if (!u)
            return;
        var id = setInterval(function () {
            u._n(t);
            clearInterval(id);
        }, this.dt);
    };
    DelayOperator.prototype._e = function (err) {
        var u = this.out;
        if (!u)
            return;
        var id = setInterval(function () {
            u._e(err);
            clearInterval(id);
        }, this.dt);
    };
    DelayOperator.prototype._c = function () {
        var u = this.out;
        if (!u)
            return;
        var id = setInterval(function () {
            u._c();
            clearInterval(id);
        }, this.dt);
    };
    return DelayOperator;
}());
/**
 * Delays periodic events by a given time period.
 *
 * Marble diagram:
 *
 * ```text
 * 1----2--3--4----5|
 *     delay(60)
 * ---1----2--3--4----5|
 * ```
 *
 * Example:
 *
 * ```js
 * import fromDiagram from 'xstream/extra/fromDiagram'
 * import delay from 'xstream/extra/delay'
 *
 * const stream = fromDiagram('1----2--3--4----5|')
 *  .compose(delay(60))
 *
 * stream.addListener({
 *   next: i => console.log(i),
 *   error: err => console.error(err),
 *   complete: () => console.log('completed')
 * })
 * ```
 *
 * ```text
 * > 1  (after 60 ms)
 * > 2  (after 160 ms)
 * > 3  (after 220 ms)
 * > 4  (after 280 ms)
 * > 5  (after 380 ms)
 * > completed
 * ```
 *
 * @param {number} period The amount of silence required in milliseconds.
 * @return {Stream}
 */
function delay(period) {
    return function delayOperator(ins) {
        return new core_1.Stream(new DelayOperator(period, ins));
    };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = delay;

},{"../core":7}],10:[function(require,module,exports){
"use strict";
var core_1 = require('../core');
var FCIL = (function () {
    function FCIL(out, op) {
        this.out = out;
        this.op = op;
    }
    FCIL.prototype._n = function (t) {
        this.out._n(t);
    };
    FCIL.prototype._e = function (err) {
        this.out._e(err);
    };
    FCIL.prototype._c = function () {
        this.op.less();
    };
    return FCIL;
}());
var FlattenConcOperator = (function () {
    function FlattenConcOperator(ins) {
        this.ins = ins;
        this.type = 'flattenConcurrently';
        this.active = 1; // number of outers and inners that have not yet ended
        this.out = null;
    }
    FlattenConcOperator.prototype._start = function (out) {
        this.out = out;
        this.ins._add(this);
    };
    FlattenConcOperator.prototype._stop = function () {
        this.ins._remove(this);
        this.active = 1;
        this.out = null;
    };
    FlattenConcOperator.prototype.less = function () {
        if (--this.active === 0) {
            var u = this.out;
            if (!u)
                return;
            u._c();
        }
    };
    FlattenConcOperator.prototype._n = function (s) {
        var u = this.out;
        if (!u)
            return;
        this.active++;
        s._add(new FCIL(u, this));
    };
    FlattenConcOperator.prototype._e = function (err) {
        var u = this.out;
        if (!u)
            return;
        u._e(err);
    };
    FlattenConcOperator.prototype._c = function () {
        this.less();
    };
    return FlattenConcOperator;
}());
exports.FlattenConcOperator = FlattenConcOperator;
/**
 * Flattens a "stream of streams", handling multiple concurrent nested streams
 * simultaneously.
 *
 * If the input stream is a stream that emits streams, then this operator will
 * return an output stream which is a flat stream: emits regular events. The
 * flattening happens concurrently. It works like this: when the input stream
 * emits a nested stream, *flattenConcurrently* will start imitating that
 * nested one. When the next nested stream is emitted on the input stream,
 * *flattenConcurrently* will also imitate that new one, but will continue to
 * imitate the previous nested streams as well.
 *
 * Marble diagram:
 *
 * ```text
 * --+--------+---------------
 *   \        \
 *    \       ----1----2---3--
 *    --a--b----c----d--------
 *     flattenConcurrently
 * -----a--b----c-1--d-2---3--
 * ```
 *
 * @return {Stream}
 */
function flattenConcurrently(ins) {
    return new core_1.Stream(new FlattenConcOperator(ins));
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = flattenConcurrently;

},{"../core":7}],11:[function(require,module,exports){
"use strict";
var core_1 = require('./core');
exports.Stream = core_1.Stream;
exports.MemoryStream = core_1.MemoryStream;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = core_1.Stream;

},{"./core":7}],12:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_Functor = require("../Data.Functor");
var Data_Semigroup = require("../Data.Semigroup");
var Alt = function (__superclass_Data$dotFunctor$dotFunctor_0, alt) {
    this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
    this.alt = alt;
};
var altArray = new Alt(function () {
    return Data_Functor.functorArray;
}, Data_Semigroup.append(Data_Semigroup.semigroupArray));
var alt = function (dict) {
    return dict.alt;
};
module.exports = {
    Alt: Alt, 
    alt: alt, 
    altArray: altArray
};

},{"../Data.Functor":94,"../Data.Semigroup":121}],13:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Plus = require("../Control.Plus");
var Data_Functor = require("../Data.Functor");
var Alternative = function (__superclass_Control$dotApplicative$dotApplicative_0, __superclass_Control$dotPlus$dotPlus_1) {
    this["__superclass_Control.Applicative.Applicative_0"] = __superclass_Control$dotApplicative$dotApplicative_0;
    this["__superclass_Control.Plus.Plus_1"] = __superclass_Control$dotPlus$dotPlus_1;
};
var alternativeArray = new Alternative(function () {
    return Control_Applicative.applicativeArray;
}, function () {
    return Control_Plus.plusArray;
});
module.exports = {
    Alternative: Alternative, 
    alternativeArray: alternativeArray
};

},{"../Control.Alt":12,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Plus":65,"../Data.Functor":94}],14:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Apply = require("../Control.Apply");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var Applicative = function (__superclass_Control$dotApply$dotApply_0, pure) {
    this["__superclass_Control.Apply.Apply_0"] = __superclass_Control$dotApply$dotApply_0;
    this.pure = pure;
};
var pure = function (dict) {
    return dict.pure;
};
var unless = function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (!v) {
                return v1;
            };
            if (v) {
                return pure(dictApplicative)(Data_Unit.unit);
            };
            throw new Error("Failed pattern match at Control.Applicative line 63, column 1 - line 63, column 19: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var when = function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (v) {
                return v1;
            };
            if (!v) {
                return pure(dictApplicative)(Data_Unit.unit);
            };
            throw new Error("Failed pattern match at Control.Applicative line 58, column 1 - line 58, column 16: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
};
var liftA1 = function (dictApplicative) {
    return function (f) {
        return function (a) {
            return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(pure(dictApplicative)(f))(a);
        };
    };
};
var applicativeFn = new Applicative(function () {
    return Control_Apply.applyFn;
}, function (x) {
    return function (v) {
        return x;
    };
});
var applicativeArray = new Applicative(function () {
    return Control_Apply.applyArray;
}, function (x) {
    return [ x ];
});
module.exports = {
    Applicative: Applicative, 
    liftA1: liftA1, 
    pure: pure, 
    unless: unless, 
    when: when, 
    applicativeFn: applicativeFn, 
    applicativeArray: applicativeArray
};

},{"../Control.Apply":16,"../Data.Functor":94,"../Data.Unit":135}],15:[function(require,module,exports){
"use strict";

// module Control.Apply

exports.arrayApply = function (fs) {
  return function (xs) {
    var result = [];
    var n = 0;
    for (var i = 0, l = fs.length; i < l; i++) {
      for (var j = 0, k = xs.length; j < k; j++) {
        result[n++] = fs[i](xs[j]);
      }
    }
    return result;
  };
};

},{}],16:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Functor = require("../Data.Functor");
var Data_Function = require("../Data.Function");
var Control_Category = require("../Control.Category");
var Apply = function (__superclass_Data$dotFunctor$dotFunctor_0, apply) {
    this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
    this.apply = apply;
};
var applyFn = new Apply(function () {
    return Data_Functor.functorFn;
}, function (f) {
    return function (g) {
        return function (x) {
            return f(x)(g(x));
        };
    };
});
var applyArray = new Apply(function () {
    return Data_Functor.functorArray;
}, $foreign.arrayApply);
var apply = function (dict) {
    return dict.apply;
};
var applyFirst = function (dictApply) {
    return function (a) {
        return function (b) {
            return apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(Data_Function["const"])(a))(b);
        };
    };
};
var applySecond = function (dictApply) {
    return function (a) {
        return function (b) {
            return apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(Data_Function["const"](Control_Category.id(Control_Category.categoryFn)))(a))(b);
        };
    };
};
var lift2 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(f)(a))(b);
            };
        };
    };
};
var lift3 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return apply(dictApply)(apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(f)(a))(b))(c);
                };
            };
        };
    };
};
var lift4 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return apply(dictApply)(apply(dictApply)(apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(f)(a))(b))(c))(d);
                    };
                };
            };
        };
    };
};
var lift5 = function (dictApply) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return function (d) {
                        return function (e) {
                            return apply(dictApply)(apply(dictApply)(apply(dictApply)(apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(f)(a))(b))(c))(d))(e);
                        };
                    };
                };
            };
        };
    };
};
module.exports = {
    Apply: Apply, 
    apply: apply, 
    applyFirst: applyFirst, 
    applySecond: applySecond, 
    lift2: lift2, 
    lift3: lift3, 
    lift4: lift4, 
    lift5: lift5, 
    applyFn: applyFn, 
    applyArray: applyArray
};

},{"../Control.Category":21,"../Data.Function":91,"../Data.Functor":94,"./foreign":15}],17:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Biapply = require("../Control.Biapply");
var Biapplicative = function (__superclass_Control$dotBiapply$dotBiapply_0, bipure) {
    this["__superclass_Control.Biapply.Biapply_0"] = __superclass_Control$dotBiapply$dotBiapply_0;
    this.bipure = bipure;
};
var bipure = function (dict) {
    return dict.bipure;
};
module.exports = {
    Biapplicative: Biapplicative, 
    bipure: bipure
};

},{"../Control.Biapply":18}],18:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_Function = require("../Data.Function");
var Data_Bifunctor = require("../Data.Bifunctor");
var Control_Category = require("../Control.Category");
var Biapply = function (__superclass_Data$dotBifunctor$dotBifunctor_0, biapply) {
    this["__superclass_Data.Bifunctor.Bifunctor_0"] = __superclass_Data$dotBifunctor$dotBifunctor_0;
    this.biapply = biapply;
};
var biapply = function (dict) {
    return dict.biapply;
};
var biapplyFirst = function (dictBiapply) {
    return function (a) {
        return function (b) {
            return biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply["__superclass_Data.Bifunctor.Bifunctor_0"]())(Data_Function["const"](Control_Category.id(Control_Category.categoryFn)))(Data_Function["const"](Control_Category.id(Control_Category.categoryFn))))(a))(b);
        };
    };
};
var biapplySecond = function (dictBiapply) {
    return function (a) {
        return function (b) {
            return biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply["__superclass_Data.Bifunctor.Bifunctor_0"]())(Data_Function["const"])(Data_Function["const"]))(a))(b);
        };
    };
};
var bilift2 = function (dictBiapply) {
    return function (f) {
        return function (g) {
            return function (a) {
                return function (b) {
                    return biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply["__superclass_Data.Bifunctor.Bifunctor_0"]())(f)(g))(a))(b);
                };
            };
        };
    };
};
var bilift3 = function (dictBiapply) {
    return function (f) {
        return function (g) {
            return function (a) {
                return function (b) {
                    return function (c) {
                        return biapply(dictBiapply)(biapply(dictBiapply)(Control_Category.id(Control_Category.categoryFn)(Data_Bifunctor.bimap(dictBiapply["__superclass_Data.Bifunctor.Bifunctor_0"]())(f)(g))(a))(b))(c);
                    };
                };
            };
        };
    };
};
module.exports = {
    Biapply: Biapply, 
    biapply: biapply, 
    biapplyFirst: biapplyFirst, 
    biapplySecond: biapplySecond, 
    bilift2: bilift2, 
    bilift3: bilift3
};

},{"../Control.Category":21,"../Data.Bifunctor":71,"../Data.Function":91}],19:[function(require,module,exports){
"use strict";

// module Control.Bind

exports.arrayBind = function (arr) {
  return function (f) {
    var result = [];
    for (var i = 0, l = arr.length; i < l; i++) {
      Array.prototype.push.apply(result, f(arr[i]));
    }
    return result;
  };
};

},{}],20:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Bind = function (__superclass_Control$dotApply$dotApply_0, bind) {
    this["__superclass_Control.Apply.Apply_0"] = __superclass_Control$dotApply$dotApply_0;
    this.bind = bind;
};
var bindFn = new Bind(function () {
    return Control_Apply.applyFn;
}, function (m) {
    return function (f) {
        return function (x) {
            return f(m(x))(x);
        };
    };
});
var bindArray = new Bind(function () {
    return Control_Apply.applyArray;
}, $foreign.arrayBind);
var bind = function (dict) {
    return dict.bind;
};
var bindFlipped = function (dictBind) {
    return Data_Function.flip(bind(dictBind));
};
var composeKleisliFlipped = function (dictBind) {
    return function (f) {
        return function (g) {
            return function (a) {
                return bindFlipped(dictBind)(f)(g(a));
            };
        };
    };
};
var composeKleisli = function (dictBind) {
    return function (f) {
        return function (g) {
            return function (a) {
                return bind(dictBind)(f(a))(g);
            };
        };
    };
};
var ifM = function (dictBind) {
    return function (cond) {
        return function (t) {
            return function (f) {
                return bind(dictBind)(cond)(function (cond$prime) {
                    if (cond$prime) {
                        return t;
                    };
                    if (!cond$prime) {
                        return f;
                    };
                    throw new Error("Failed pattern match at Control.Bind line 103, column 35 - line 103, column 56: " + [ cond$prime.constructor.name ]);
                });
            };
        };
    };
};
var join = function (dictBind) {
    return function (m) {
        return bind(dictBind)(m)(Control_Category.id(Control_Category.categoryFn));
    };
};
module.exports = {
    Bind: Bind, 
    bind: bind, 
    bindFlipped: bindFlipped, 
    composeKleisli: composeKleisli, 
    composeKleisliFlipped: composeKleisliFlipped, 
    ifM: ifM, 
    join: join, 
    bindFn: bindFn, 
    bindArray: bindArray
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Category":21,"../Data.Function":91,"../Data.Functor":94,"./foreign":19}],21:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Category = function (__superclass_Control$dotSemigroupoid$dotSemigroupoid_0, id) {
    this["__superclass_Control.Semigroupoid.Semigroupoid_0"] = __superclass_Control$dotSemigroupoid$dotSemigroupoid_0;
    this.id = id;
};
var id = function (dict) {
    return dict.id;
};
var categoryFn = new Category(function () {
    return Control_Semigroupoid.semigroupoidFn;
}, function (x) {
    return x;
});
module.exports = {
    Category: Category, 
    id: id, 
    categoryFn: categoryFn
};

},{"../Control.Semigroupoid":66}],22:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Extend = require("../Control.Extend");
var Data_Functor = require("../Data.Functor");
var Comonad = function (__superclass_Control$dotExtend$dotExtend_0, extract) {
    this["__superclass_Control.Extend.Extend_0"] = __superclass_Control$dotExtend$dotExtend_0;
    this.extract = extract;
};
var extract = function (dict) {
    return dict.extract;
};
module.exports = {
    Comonad: Comonad, 
    extract: extract
};

},{"../Control.Extend":25,"../Data.Functor":94}],23:[function(require,module,exports){
var Cycle = require('@cycle/xstream-run');
var xs = require('xstream');

function makeDriver(eff) {
  return function (sink) {
    return eff(sink)();
  };
}

exports._run1 = function (_main, _driver) {
  return function () {
    function main(sources) {
      return {
        a: _main(sources)
      };
    }
    var drivers = {
      a: makeDriver(_driver)
    }
    return Cycle.run(main, drivers);
  };
};

exports._run2 = function (_main, _drivers) {
  return function () {
    function main(sources) {
      var sinks = _main(sources.a)(sources.b);
      return {
        a: sinks.value0,
        b: sinks.value1
      };
    }
    var drivers = {
      a: makeDriver(_drivers.value0),
      b: makeDriver(_drivers.value1)
    }
    return Cycle.run(main, drivers);
  };
};

exports._run3 = function (_main, _drivers) {
  return function () {
    function main(sources) {
      var sinks = _main(sources.a)(sources.b)(sources.c);
      return {
        a: sinks.value0.value0,
        b: sinks.value0.value1,
        c: sinks.value1
      };
    }
    var drivers = {
      a: makeDriver(_drivers.value0.value0),
      b: makeDriver(_drivers.value0.value1),
      c: makeDriver(_drivers.value1)
    }
    return Cycle.run(main, drivers);
  };
};
},{"@cycle/xstream-run":3,"xstream":11}],24:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
var Data_Tuple_Nested = require("../Data.Tuple.Nested");
var run3 = function (main) {
    return function (drivers) {
        return $foreign._run3(main, drivers);
    };
};
var run2 = function (main) {
    return function (drivers) {
        return $foreign._run2(main, drivers);
    };
};
var run1 = function (main) {
    return function (drivers) {
        return $foreign._run1(main, drivers);
    };
};
module.exports = {
    run1: run1, 
    run2: run2, 
    run3: run3
};

},{"../Control.Monad.Eff":47,"../Data.Function.Uncurried":90,"../Data.Tuple.Nested":132,"../Prelude":144,"./foreign":23}],25:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Category = require("../Control.Category");
var Data_Functor = require("../Data.Functor");
var Data_Semigroup = require("../Data.Semigroup");
var Extend = function (__superclass_Data$dotFunctor$dotFunctor_0, extend) {
    this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
    this.extend = extend;
};
var extendFn = function (dictSemigroup) {
    return new Extend(function () {
        return Data_Functor.functorFn;
    }, function (f) {
        return function (g) {
            return function (w) {
                return f(function (w$prime) {
                    return g(Data_Semigroup.append(dictSemigroup)(w)(w$prime));
                });
            };
        };
    });
};
var extend = function (dict) {
    return dict.extend;
};
var extendFlipped = function (dictExtend) {
    return function (w) {
        return function (f) {
            return extend(dictExtend)(f)(w);
        };
    };
};
var duplicate = function (dictExtend) {
    return extend(dictExtend)(Control_Category.id(Control_Category.categoryFn));
};
var composeCoKleisliFlipped = function (dictExtend) {
    return function (f) {
        return function (g) {
            return function (w) {
                return f(extend(dictExtend)(g)(w));
            };
        };
    };
};
var composeCoKleisli = function (dictExtend) {
    return function (f) {
        return function (g) {
            return function (w) {
                return g(extend(dictExtend)(f)(w));
            };
        };
    };
};
module.exports = {
    Extend: Extend, 
    composeCoKleisli: composeCoKleisli, 
    composeCoKleisliFlipped: composeCoKleisliFlipped, 
    duplicate: duplicate, 
    extend: extend, 
    extendFlipped: extendFlipped, 
    extendFn: extendFn
};

},{"../Control.Category":21,"../Data.Functor":94,"../Data.Semigroup":121}],26:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_Unit = require("../Data.Unit");
var Lazy = function (defer) {
    this.defer = defer;
};
var defer = function (dict) {
    return dict.defer;
};
var fix = function (dictLazy) {
    return function (f) {
        return defer(dictLazy)(function (v) {
            return f(fix(dictLazy)(f));
        });
    };
};
module.exports = {
    Lazy: Lazy, 
    defer: defer, 
    fix: fix
};

},{"../Data.Unit":135}],27:[function(require,module,exports){
/* global exports */
"use strict";

exports._makeVar = function (nonCanceler) {
  return function(success, error) {
    try {
      success({
        consumers: [],
        producers: [],
        error: undefined
      });
    } catch (err) {
      error(err);
    }

    return nonCanceler;
  };
};

exports._takeVar = function (nonCanceler, avar) {
  return function(success, error) {
    if (avar.error !== undefined) {
      error(avar.error);
    } else if (avar.producers.length > 0) {
      var producer = avar.producers.shift();

      producer(success, error);
    } else {
      avar.consumers.push({success: success, error: error});
    }

    return nonCanceler;
  };
};

exports._putVar = function (nonCanceler, avar, a) {
  return function(success, error) {
    if (avar.error !== undefined) {
      error(avar.error);
    } else if (avar.consumers.length === 0) {
      avar.producers.push(function(success, error) {
        try {
          success(a);
        } catch (err) {
          error(err);
        }
      });

      success({});
    } else {
      var consumer = avar.consumers.shift();

      try {
        consumer.success(a);
      } catch (err) {
        error(err);

        return;
      }

      success({});
    }

    return nonCanceler;
  };
};

exports._killVar = function (nonCanceler, avar, e) {
  return function(success, error) {
    if (avar.error !== undefined) {
      error(avar.error);
    } else {
      var errors = [];

      avar.error = e;

      while (avar.consumers.length > 0) {
        var consumer = avar.consumers.shift();

        try {
          consumer.error(e);
        } catch (err) {
          errors.push(err);
        }
      }

      if (errors.length > 0) error(errors[0]);
      else success({});
    }

    return nonCanceler;
  };
};

},{}],28:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Monad_Eff_Exception = require("../Control.Monad.Eff.Exception");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
module.exports = {
    _killVar: $foreign._killVar, 
    _makeVar: $foreign._makeVar, 
    _putVar: $foreign._putVar, 
    _takeVar: $foreign._takeVar
};

},{"../Control.Monad.Eff.Exception":37,"../Data.Function.Uncurried":90,"../Prelude":144,"./foreign":27}],29:[function(require,module,exports){
/* global exports */
"use strict";

exports._cancelWith = function (nonCanceler, aff, canceler1) {
  return function(success, error) {
    var canceler2 = aff(success, error);

    return function(e) {
      return function(success, error) {
        var cancellations = 0;
        var result        = false;
        var errored       = false;

        var s = function(bool) {
          cancellations = cancellations + 1;
          result        = result || bool;

          if (cancellations === 2 && !errored) {
            success(result);
          }
        };

        var f = function(err) {
          if (!errored) {
            errored = true;
            error(err);
          }
        };

        canceler2(e)(s, f);
        canceler1(e)(s, f);

        return nonCanceler;
      };
    };
  };
}

exports._setTimeout = function (nonCanceler, millis, aff) {
  var set = setTimeout, clear = clearTimeout;
  if (millis <= 0 && typeof setImmediate === "function") {
    set = setImmediate;
    clear = clearImmediate;
  }
  return function(success, error) {
    var canceler;

    var timeout = set(function() {
      canceler = aff(success, error);
    }, millis);

    return function(e) {
      return function(s, f) {
        if (canceler !== undefined) {
          return canceler(e)(s, f);
        } else {
          clear(timeout);
          s(true);
          return nonCanceler;
        }
      };
    };
  };
}

exports._unsafeInterleaveAff = function (aff) {
  return aff;
}

exports._forkAff = function (nonCanceler, aff) {
  var voidF = function(){};

  return function(success, error) {
    var canceler = aff(voidF, voidF);
    success(canceler);
    return nonCanceler;
  };
}

exports._forkAll = function (nonCanceler, foldl, affs) {
  var voidF = function(){};

  return function(success, error) {
    try {
      var cancelers = foldl(function(acc) {
        return function(aff) {
          acc.push(aff(voidF, voidF));
          return acc;
        }
      })([])(affs);
    } catch (err) {
      error(err)
    }

    var canceler = function(e) {
      return function(success, error) {
        var cancellations = 0;
        var result        = false;
        var errored       = false;

        var s = function(bool) {
          cancellations = cancellations + 1;
          result        = result || bool;

          if (cancellations === cancelers.length && !errored) {
            success(result);
          }
        };

        var f = function(err) {
          if (!errored) {
            errored = true;
            error(err);
          }
        };

        for (var i = 0; i < cancelers.length; i++) {
          cancelers[i](e)(s, f);
        }

        return nonCanceler;
      };
    };

    success(canceler);
    return nonCanceler;
  };
}

exports._makeAff = function (cb) {
  return function(success, error) {
    try {
      return cb(function(e) {
        return function() {
          error(e);
        };
      })(function(v) {
        return function() {
          success(v);
        };
      })();
    } catch (err) {
      error(err);
    }
  }
}

exports._pure = function (nonCanceler, v) {
  return function(success, error) {
    success(v);
    return nonCanceler;
  };
}

exports._throwError = function (nonCanceler, e) {
  return function(success, error) {
    error(e);
    return nonCanceler;
  };
}

exports._fmap = function (f, aff) {
  return function(success, error) {
    try {
      return aff(function(v) {
        try {
          var v2 = f(v);
        } catch (err) {
          error(err)
        }
        success(v2);
      }, error);
    } catch (err) {
      error(err);
    }
  };
}

exports._bind = function (alwaysCanceler, aff, f) {
  return function(success, error) {
    var canceler1, canceler2;

    var isCanceled    = false;
    var requestCancel = false;

    var onCanceler = function(){};

    canceler1 = aff(function(v) {
      if (requestCancel) {
        isCanceled = true;

        return alwaysCanceler;
      } else {
        canceler2 = f(v)(success, error);

        onCanceler(canceler2);

        return canceler2;
      }
    }, error);

    return function(e) {
      return function(s, f) {
        requestCancel = true;

        if (canceler2 !== undefined) {
          return canceler2(e)(s, f);
        } else {
          return canceler1(e)(function(bool) {
            if (bool || isCanceled) {
              s(true);
            } else {
              onCanceler = function(canceler) {
                canceler(e)(s, f);
              };
            }
          }, f);
        }
      };
    };
  };
}

exports._attempt = function (Left, Right, aff) {
  return function(success, error) {
    try {
      return aff(function(v) {
        success(Right(v));
      }, function(e) {
        success(Left(e));
      });
    } catch (err) {
      success(Left(err));
    }
  };
}

exports._runAff = function (errorT, successT, aff) {
  return function() {
    return aff(function(v) {
      successT(v)();
    }, function(e) {
      errorT(e)();
    });
  };
}

exports._liftEff = function (nonCanceler, e) {
  return function(success, error) {
    var result;
    try {
      result = e();
    } catch (err) {
      error(err);
      return nonCanceler;
    }

    success(result);
    return nonCanceler;
  };
}

exports._tailRecM = function (isLeft, f, a) {
  return function(success, error) {
    return function go(acc) {
      var result, status, canceler;

      // Observes synchronous effects using a flag.
      //   status = 0 (unresolved status)
      //   status = 1 (synchronous effect)
      //   status = 2 (asynchronous effect)
      while (true) {
        status = 0;
        canceler = f(acc)(function(v) {
          // If the status is still unresolved, we have observed a
          // synchronous effect. Otherwise, the status will be `2`.
          if (status === 0) {
            // Store the result for further synchronous processing.
            result = v;
            status = 1;
          } else {
            // When we have observed an asynchronous effect, we use normal
            // recursion. This is safe because we will be on a new stack.
            if (isLeft(v)) {
              go(v.value0);
            } else {
              try {
                success(v.value0);
              } catch (err) {
                error(err);
              }
            }
          }
        }, error);

        // If the status has already resolved to `1` by our Aff handler, then
        // we have observed a synchronous effect. Otherwise it will still be
        // `0`.
        if (status === 1) {
          // When we have observed a synchronous effect, we merely swap out the
          // accumulator and continue the loop, preserving stack.
          if (isLeft(result)) {
            acc = result.value0;
            continue;
          } else {
            try {
              success(result.value0);
            } catch (err) {
              error(err);
            }
          }
        } else {
          // If the status has not resolved yet, then we have observed an
          // asynchronous effect.
          status = 2;
        }
        return canceler;
      }

    }(a);
  };
};

},{}],30:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Monad_Aff_Internal = require("../Control.Monad.Aff.Internal");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Eff_Exception = require("../Control.Monad.Eff.Exception");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_Parallel_Class = require("../Control.Parallel.Class");
var Control_Plus = require("../Control.Plus");
var Data_Either = require("../Data.Either");
var Data_Foldable = require("../Data.Foldable");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
var Data_Monoid = require("../Data.Monoid");
var Unsafe_Coerce = require("../Unsafe.Coerce");
var Data_Semigroup = require("../Data.Semigroup");
var Control_Apply = require("../Control.Apply");
var Data_Functor = require("../Data.Functor");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Function = require("../Data.Function");
var Control_MonadZero = require("../Control.MonadZero");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Eq = require("../Data.Eq");
var Data_Unit = require("../Data.Unit");
var Data_Semiring = require("../Data.Semiring");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Canceler = function (x) {
    return x;
};
var runAff = function (ex) {
    return function (f) {
        return function (aff) {
            return $foreign._runAff(ex, f, aff);
        };
    };
};
var makeAff$prime = function (h) {
    return $foreign._makeAff(h);
};
var functorAff = new Data_Functor.Functor(function (f) {
    return function (fa) {
        return $foreign._fmap(f, fa);
    };
});
var fromAVBox = Unsafe_Coerce.unsafeCoerce;
var cancel = function (v) {
    return v;
};
var launchAff = (function () {
    var lowerEx = Data_Functor.map(Control_Monad_Eff.functorEff)(function ($34) {
        return Canceler(Data_Functor.map(Data_Functor.functorFn)($foreign._unsafeInterleaveAff)(cancel($34)));
    });
    return function ($35) {
        return lowerEx(runAff(Control_Monad_Eff_Exception.throwException)(Data_Function["const"](Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit)))($foreign._unsafeInterleaveAff($35)));
    };
})();
var attempt = function (aff) {
    return $foreign._attempt(Data_Either.Left.create, Data_Either.Right.create, aff);
};
var apathize = function (a) {
    return Data_Functor.map(functorAff)(Data_Function["const"](Data_Unit.unit))(attempt(a));
};
var applyAff = new Control_Apply.Apply(function () {
    return functorAff;
}, function (ff) {
    return function (fa) {
        return $foreign._bind(alwaysCanceler, ff, function (f) {
            return Data_Functor.map(functorAff)(f)(fa);
        });
    };
});
var applicativeAff = new Control_Applicative.Applicative(function () {
    return applyAff;
}, function (v) {
    return $foreign._pure(nonCanceler, v);
});
var nonCanceler = Data_Function["const"](Control_Applicative.pure(applicativeAff)(false));
var alwaysCanceler = Data_Function["const"](Control_Applicative.pure(applicativeAff)(true));
var cancelWith = function (aff) {
    return function (c) {
        return $foreign._cancelWith(nonCanceler, aff, c);
    };
};
var forkAff = function (aff) {
    return $foreign._forkAff(nonCanceler, aff);
};
var forkAll = function (dictFoldable) {
    return function (affs) {
        return $foreign._forkAll(nonCanceler, Data_Foldable.foldl(dictFoldable), affs);
    };
};
var killVar = function (q) {
    return function (e) {
        return Data_Function.apply(fromAVBox)(Control_Monad_Aff_Internal._killVar(nonCanceler, q, e));
    };
};
var later$prime = function (n) {
    return function (aff) {
        return $foreign._setTimeout(nonCanceler, n, aff);
    };
};
var later = later$prime(0);
var liftEff$prime = function (eff) {
    return attempt($foreign._unsafeInterleaveAff($foreign._liftEff(nonCanceler, eff)));
};
var makeAff = function (h) {
    return makeAff$prime(function (e) {
        return function (a) {
            return Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Function["const"](nonCanceler))(h(e)(a));
        };
    });
};
var makeVar = Data_Function.apply(fromAVBox)(Control_Monad_Aff_Internal._makeVar(nonCanceler));
var putVar = function (q) {
    return function (a) {
        return Data_Function.apply(fromAVBox)(Control_Monad_Aff_Internal._putVar(nonCanceler, q, a));
    };
};
var takeVar = function (q) {
    return Data_Function.apply(fromAVBox)(Control_Monad_Aff_Internal._takeVar(nonCanceler, q));
};
var semigroupAff = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (a) {
        return function (b) {
            return Control_Apply.apply(applyAff)(Data_Functor.map(functorAff)(Data_Semigroup.append(dictSemigroup))(a))(b);
        };
    });
};
var monoidAff = function (dictMonoid) {
    return new Data_Monoid.Monoid(function () {
        return semigroupAff(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    }, Control_Applicative.pure(applicativeAff)(Data_Monoid.mempty(dictMonoid)));
};
var semigroupCanceler = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        return function (e) {
            return Control_Apply.apply(applyAff)(Data_Functor.map(functorAff)(Data_HeytingAlgebra.disj(Data_HeytingAlgebra.heytingAlgebraBoolean))(v(e)))(v1(e));
        };
    };
});
var monoidCanceler = new Data_Monoid.Monoid(function () {
    return semigroupCanceler;
}, Data_Function["const"](Control_Applicative.pure(applicativeAff)(true)));
var bindAff = new Control_Bind.Bind(function () {
    return applyAff;
}, function (fa) {
    return function (f) {
        return $foreign._bind(alwaysCanceler, fa, f);
    };
});
var monadAff = new Control_Monad.Monad(function () {
    return applicativeAff;
}, function () {
    return bindAff;
});
var monadContAff = new Control_Monad_Cont_Class.MonadCont(function () {
    return monadAff;
}, function (f) {
    return makeAff(function (eb) {
        return function (cb) {
            return Data_Function.apply(Data_Functor["void"](Control_Monad_Eff.functorEff))(runAff(eb)(cb)(f(function (a) {
                return makeAff(function (v) {
                    return function (v1) {
                        return cb(a);
                    };
                });
            })));
        };
    });
});
var monadEffAff = new Control_Monad_Eff_Class.MonadEff(function () {
    return monadAff;
}, function (eff) {
    return $foreign._liftEff(nonCanceler, eff);
});
var monadRecAff = new Control_Monad_Rec_Class.MonadRec(function () {
    return monadAff;
}, function (f) {
    return function (a) {
        return $foreign._tailRecM(Data_Either.isLeft, f, a);
    };
});
var monadErrorAff = new Control_Monad_Error_Class.MonadError(function () {
    return monadAff;
}, function (aff) {
    return function (ex) {
        return Control_Bind.bind(bindAff)(attempt(aff))(Data_Either.either(ex)(Control_Applicative.pure(applicativeAff)));
    };
}, function (e) {
    return $foreign._throwError(nonCanceler, e);
});
var $$finally = function (aff1) {
    return function (aff2) {
        return Control_Bind.bind(bindAff)(attempt(aff1))(function (v) {
            return Control_Bind.bind(bindAff)(aff2)(function () {
                return Data_Either.either(Control_Monad_Error_Class.throwError(monadErrorAff))(Control_Applicative.pure(applicativeAff))(v);
            });
        });
    };
};
var monadParAff = new Control_Parallel_Class.MonadPar(function () {
    return monadAff;
}, function (f) {
    return function (ma) {
        return function (mb) {
            var putOrKill = function (v) {
                return Data_Either.either(killVar(v))(putVar(v));
            };
            return Control_Bind.bind(bindAff)(makeVar)(function (v) {
                return Control_Bind.bind(bindAff)(makeVar)(function (v1) {
                    return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(putOrKill(v))(attempt(ma))))(function (v2) {
                        return Control_Bind.bind(bindAff)(forkAff(Control_Bind.bindFlipped(bindAff)(putOrKill(v1))(attempt(mb))))(function (v3) {
                            return Control_Apply.apply(applyAff)(Data_Functor.map(functorAff)(f)(takeVar(v)))(takeVar(v1));
                        });
                    });
                });
            });
        };
    };
});
var monadRaceAff = new Control_Parallel_Class.MonadRace(function () {
    return monadParAff;
}, function (a1) {
    return function (a2) {
        var maybeKill = function (va) {
            return function (ve) {
                return function (err) {
                    return Control_Bind.bind(bindAff)(takeVar(ve))(function (v) {
                        return Control_Bind.bind(bindAff)((function () {
                            var $29 = v === 1;
                            if ($29) {
                                return killVar(va)(err);
                            };
                            if (!$29) {
                                return Control_Applicative.pure(applicativeAff)(Data_Unit.unit);
                            };
                            throw new Error("Failed pattern match at Control.Monad.Aff line 240, column 7 - line 240, column 51: " + [ $29.constructor.name ]);
                        })())(function () {
                            return putVar(ve)(v + 1 | 0);
                        });
                    });
                };
            };
        };
        return Control_Bind.bind(bindAff)(makeVar)(function (v) {
            return Control_Bind.bind(bindAff)(makeVar)(function (v1) {
                return Control_Bind.bind(bindAff)(putVar(v1)(0))(function () {
                    return Control_Bind.bind(bindAff)(Data_Function.apply(forkAff)(Control_Bind.bindFlipped(bindAff)(Data_Either.either(maybeKill(v)(v1))(putVar(v)))(attempt(a1))))(function (v2) {
                        return Control_Bind.bind(bindAff)(Data_Function.apply(forkAff)(Control_Bind.bindFlipped(bindAff)(Data_Either.either(maybeKill(v)(v1))(putVar(v)))(attempt(a2))))(function (v3) {
                            return cancelWith(takeVar(v))(Data_Semigroup.append(semigroupCanceler)(v2)(v3));
                        });
                    });
                });
            });
        });
    };
}, Data_Function.apply(Control_Monad_Error_Class.throwError(monadErrorAff))(Control_Monad_Eff_Exception.error("Stalled")));
var altAff = new Control_Alt.Alt(function () {
    return functorAff;
}, function (a1) {
    return function (a2) {
        return Control_Bind.bind(bindAff)(attempt(a1))(Data_Either.either(Data_Function["const"](a2))(Control_Applicative.pure(applicativeAff)));
    };
});
var plusAff = new Control_Plus.Plus(function () {
    return altAff;
}, Data_Function.apply(Control_Monad_Error_Class.throwError(monadErrorAff))(Control_Monad_Eff_Exception.error("Always fails")));
var alternativeAff = new Control_Alternative.Alternative(function () {
    return applicativeAff;
}, function () {
    return plusAff;
});
var monadZero = new Control_MonadZero.MonadZero(function () {
    return alternativeAff;
}, function () {
    return monadAff;
});
var monadPlusAff = new Control_MonadPlus.MonadPlus(function () {
    return monadZero;
});
module.exports = {
    Canceler: Canceler, 
    apathize: apathize, 
    attempt: attempt, 
    cancel: cancel, 
    cancelWith: cancelWith, 
    "finally": $$finally, 
    forkAff: forkAff, 
    forkAll: forkAll, 
    later: later, 
    "later'": later$prime, 
    launchAff: launchAff, 
    "liftEff'": liftEff$prime, 
    makeAff: makeAff, 
    "makeAff'": makeAff$prime, 
    nonCanceler: nonCanceler, 
    runAff: runAff, 
    semigroupAff: semigroupAff, 
    monoidAff: monoidAff, 
    functorAff: functorAff, 
    applyAff: applyAff, 
    applicativeAff: applicativeAff, 
    bindAff: bindAff, 
    monadAff: monadAff, 
    monadEffAff: monadEffAff, 
    monadErrorAff: monadErrorAff, 
    altAff: altAff, 
    plusAff: plusAff, 
    alternativeAff: alternativeAff, 
    monadZero: monadZero, 
    monadPlusAff: monadPlusAff, 
    monadRecAff: monadRecAff, 
    monadContAff: monadContAff, 
    semigroupCanceler: semigroupCanceler, 
    monoidCanceler: monoidCanceler, 
    monadParAff: monadParAff, 
    monadRaceAff: monadRaceAff
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.Monad.Aff.Internal":28,"../Control.Monad.Cont.Class":31,"../Control.Monad.Eff":47,"../Control.Monad.Eff.Class":33,"../Control.Monad.Eff.Exception":37,"../Control.Monad.Error.Class":48,"../Control.Monad.Rec.Class":54,"../Control.MonadPlus":62,"../Control.MonadZero":63,"../Control.Parallel.Class":64,"../Control.Plus":65,"../Control.Semigroupoid":66,"../Data.Either":79,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":91,"../Data.Function.Uncurried":90,"../Data.Functor":94,"../Data.HeytingAlgebra":96,"../Data.Monoid":111,"../Data.Semigroup":121,"../Data.Semiring":123,"../Data.Unit":135,"../Prelude":144,"../Unsafe.Coerce":146,"./foreign":29}],31:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var MonadCont = function (__superclass_Control$dotMonad$dotMonad_0, callCC) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.callCC = callCC;
};
var callCC = function (dict) {
    return dict.callCC;
};
module.exports = {
    MonadCont: MonadCont, 
    callCC: callCC
};

},{"../Prelude":144}],32:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans = require("../Control.Monad.Trans");
var Data_Functor = require("../Data.Functor");
var Data_Function = require("../Data.Function");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var ContT = function (x) {
    return x;
};
var withContT = function (f) {
    return function (v) {
        return function (k) {
            return v(f(k));
        };
    };
};
var runContT = function (v) {
    return function (k) {
        return v(k);
    };
};
var monadTransContT = new Control_Monad_Trans.MonadTrans(function (dictMonad) {
    return function (m) {
        return function (k) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(m)(k);
        };
    };
});
var mapContT = function (f) {
    return function (v) {
        return function (k) {
            return f(v(k));
        };
    };
};
var functorContT = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return function (v) {
            return function (k) {
                return v(function (a) {
                    return Data_Function.apply(k)(f(a));
                });
            };
        };
    });
};
var applyContT = function (dictApply) {
    return new Control_Apply.Apply(function () {
        return functorContT(dictApply["__superclass_Data.Functor.Functor_0"]());
    }, function (v) {
        return function (v1) {
            return function (k) {
                return v(function (g) {
                    return v1(function (a) {
                        return k(g(a));
                    });
                });
            };
        };
    });
};
var bindContT = function (dictBind) {
    return new Control_Bind.Bind(function () {
        return applyContT(dictBind["__superclass_Control.Apply.Apply_0"]());
    }, function (v) {
        return function (k) {
            return function (k$prime) {
                return v(function (a) {
                    var $32 = k(a);
                    return $32(k$prime);
                });
            };
        };
    });
};
var applicativeContT = function (dictApplicative) {
    return new Control_Applicative.Applicative(function () {
        return applyContT(dictApplicative["__superclass_Control.Apply.Apply_0"]());
    }, function (a) {
        return function (k) {
            return k(a);
        };
    });
};
var monadContT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeContT(dictMonad["__superclass_Control.Applicative.Applicative_0"]());
    }, function () {
        return bindContT(dictMonad["__superclass_Control.Bind.Bind_1"]());
    });
};
var monadContContT = function (dictMonad) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadContT(dictMonad);
    }, function (f) {
        return function (k) {
            var $34 = f(function (a) {
                return function (v) {
                    return k(a);
                };
            });
            return $34(k);
        };
    });
};
var monadEffContT = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadContT(dictMonadEff["__superclass_Control.Monad.Monad_0"]());
    }, function ($38) {
        return Control_Monad_Trans.lift(monadTransContT)(dictMonadEff["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($38));
    });
};
var monadReaderContT = function (dictMonadReader) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadContT(dictMonadReader["__superclass_Control.Monad.Monad_0"]());
    }, Control_Monad_Trans.lift(monadTransContT)(dictMonadReader["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Reader_Class.ask(dictMonadReader)), function (f) {
        return function (v) {
            return function (k) {
                return Control_Bind.bind((dictMonadReader["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Reader_Class.ask(dictMonadReader))(function (v1) {
                    return Control_Monad_Reader_Class.local(dictMonadReader)(f)(v(function ($39) {
                        return Control_Monad_Reader_Class.local(dictMonadReader)(Data_Function["const"](v1))(k($39));
                    }));
                });
            };
        };
    });
};
var monadStateContT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadContT(dictMonadState["__superclass_Control.Monad.Monad_0"]());
    }, function ($40) {
        return Control_Monad_Trans.lift(monadTransContT)(dictMonadState["__superclass_Control.Monad.Monad_0"]())(Control_Monad_State_Class.state(dictMonadState)($40));
    });
};
module.exports = {
    ContT: ContT, 
    mapContT: mapContT, 
    runContT: runContT, 
    withContT: withContT, 
    monadContContT: monadContContT, 
    functorContT: functorContT, 
    applyContT: applyContT, 
    applicativeContT: applicativeContT, 
    bindContT: bindContT, 
    monadContT: monadContT, 
    monadTransContT: monadTransContT, 
    monadEffContT: monadEffContT, 
    monadReaderContT: monadReaderContT, 
    monadStateContT: monadStateContT
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.Monad.Cont.Class":31,"../Control.Monad.Eff.Class":33,"../Control.Monad.Reader.Class":52,"../Control.Monad.State.Class":57,"../Control.Monad.Trans":58,"../Control.Semigroupoid":66,"../Data.Function":91,"../Data.Functor":94,"../Prelude":144}],33:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Category = require("../Control.Category");
var Control_Monad = require("../Control.Monad");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var MonadEff = function (__superclass_Control$dotMonad$dotMonad_0, liftEff) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.liftEff = liftEff;
};
var monadEffEff = new MonadEff(function () {
    return Control_Monad_Eff.monadEff;
}, Control_Category.id(Control_Category.categoryFn));
var liftEff = function (dict) {
    return dict.liftEff;
};
module.exports = {
    MonadEff: MonadEff, 
    liftEff: liftEff, 
    monadEffEff: monadEffEff
};

},{"../Control.Category":21,"../Control.Monad":61,"../Control.Monad.Eff":47}],34:[function(require,module,exports){
"use strict";

// module Control.Monad.Eff.Console

exports.log = function (s) {
  return function () {
    console.log(s);
    return {};
  };
};

exports.warn = function (s) {
  return function () {
    console.warn(s);
    return {};
  };
};

exports.error = function (s) {
  return function () {
    console.error(s);
    return {};
  };
};

exports.info = function (s) {
  return function () {
    console.info(s);
    return {};
  };
};

},{}],35:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Show = require("../Data.Show");
var Data_Unit = require("../Data.Unit");
var warnShow = function (dictShow) {
    return function (a) {
        return $foreign.warn(Data_Show.show(dictShow)(a));
    };
};
var logShow = function (dictShow) {
    return function (a) {
        return $foreign.log(Data_Show.show(dictShow)(a));
    };
};
var infoShow = function (dictShow) {
    return function (a) {
        return $foreign.info(Data_Show.show(dictShow)(a));
    };
};
var errorShow = function (dictShow) {
    return function (a) {
        return $foreign.error(Data_Show.show(dictShow)(a));
    };
};
module.exports = {
    errorShow: errorShow, 
    infoShow: infoShow, 
    logShow: logShow, 
    warnShow: warnShow, 
    error: $foreign.error, 
    info: $foreign.info, 
    log: $foreign.log, 
    warn: $foreign.warn
};

},{"../Control.Monad.Eff":47,"../Data.Show":125,"../Data.Unit":135,"./foreign":34}],36:[function(require,module,exports){
/* global exports */
"use strict";

// module Control.Monad.Eff.Exception

exports.showErrorImpl = function (err) {
  return err.stack || err.toString();
};

exports.error = function (msg) {
  return new Error(msg);
};

exports.message = function (e) {
  return e.message;
};

exports.stackImpl = function (just) {
  return function (nothing) {
    return function (e) {
      return e.stack ? just(e.stack) : nothing;
    };
  };
};

exports.throwException = function (e) {
  return function () {
    throw e;
  };
};

exports.catchException = function (c) {
  return function (t) {
    return function () {
      try {
        return t();
      } catch (e) {
        if (e instanceof Error || Object.prototype.toString.call(e) === "[object Error]") {
          return c(e)();
        } else {
          return c(new Error(e.toString()))();
        }
      }
    };
  };
};

},{}],37:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Either = require("../Data.Either");
var Data_Maybe = require("../Data.Maybe");
var Data_Show = require("../Data.Show");
var Prelude = require("../Prelude");
var Control_Applicative = require("../Control.Applicative");
var Data_Functor = require("../Data.Functor");
var $$try = function (action) {
    return $foreign.catchException(function ($0) {
        return Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Either.Left.create($0));
    })(Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Either.Right.create)(action));
};
var $$throw = function ($1) {
    return $foreign.throwException($foreign.error($1));
};
var stack = $foreign.stackImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var showError = new Data_Show.Show($foreign.showErrorImpl);
module.exports = {
    stack: stack, 
    "throw": $$throw, 
    "try": $$try, 
    showError: showError, 
    catchException: $foreign.catchException, 
    error: $foreign.error, 
    message: $foreign.message, 
    throwException: $foreign.throwException
};

},{"../Control.Applicative":14,"../Control.Monad.Eff":47,"../Control.Semigroupoid":66,"../Data.Either":79,"../Data.Functor":94,"../Data.Maybe":104,"../Data.Show":125,"../Prelude":144,"./foreign":36}],38:[function(require,module,exports){
/* global exports */
"use strict";

exports.ready = function(func) {
    return function() {
        jQuery(document).ready(func);
    };
};

exports.select = function(selector) {
    return function() {
        return jQuery(selector);
    };
};

exports.find = function(selector) {
    return function(ob) {
        return function() {
            return ob.find(selector);
        };
    };
};

exports.parent = function(ob) {
    return function() {
        return ob.parent();
    };
};

exports.closest = function(selector) {
    return function(ob) {
        return function() {
            return ob.closest(selector);
        };
    };
};

exports.create = function(html) {
    return function() {
        return jQuery(html);
    };
};

exports.setAttr = function(attr) {
    return function(val) {
        return function(ob) {
            return function() {
                ob.attr(attr, val);
            };
        };
    };
};

exports.attr = function(attrs) {
    return function(ob) {
        return function() {
            ob.attr(attrs);
        };
    };
};

exports.css = function(props) {
    return function(ob) {
        return function() {
            ob.css(props);
        };
    };
};

exports.hasClass = function(cls) {
    return function(ob) {
        return function() {
            return ob.hasClass(cls);
        };
    };
};

exports.toggleClass = function(cls) {
    return function(ob) {
        return function() {
            ob.toggleClass(cls);
        };
    };
};

exports.setClass = function(cls) {
    return function(flag) {
        return function(ob) {
            return function() {
                ob.toggleClass(cls, flag);
            };
        };
    };
};

exports.setProp = function(p) {
    return function(val) {
        return function(ob) {
            return function() {
                ob.prop(p, val);
            };
        };
    };
};

exports.getProp = function(p) {
    return function(ob) {
        return function() {
            return ob.prop(p);
        };
    };
};

exports.append = function(ob1) {
    return function(ob) {
        return function() {
            ob.append(ob1);
        };
    };
};

exports.appendText = function(s) {
    return function(ob) {
        return function() {
            ob.append(s);
        };
    };
};

exports.body = function() {
    return jQuery(document.body);
};

exports.remove = function(ob) {
    return function() {
        ob.remove();
    };
};

exports.clear = function(ob) {
    return function() {
        ob.empty();
    };
};

exports.before = function(ob) {
    return function(ob1) {
        return function() {
            ob1.before(ob);
        };
    };
};

exports.getText = function(ob) {
    return function() {
        return ob.text();
    };
};

exports.setText = function(text) {
    return function(ob) {
        return function() {
            ob.text(text);
        };
    };
};

exports.getHtml = function(ob) {
    return function() {
        return ob.html();
    };
};

exports.setHtml = function(html) {
    return function(ob) {
        return function() {
            ob.html(html);
        };
    };
};

exports.getValue = function(ob) {
    return function() {
        return ob.val();
    };
};

exports.setValue = function(val) {
    return function(ob) {
        return function() {
            ob.val(val);
        };
    };
};

exports.toggle = function(ob) {
    return function() {
        ob.toggle();
    };
};

exports.setVisible = function(flag) {
    return function(ob) {
        return function() {
            ob.toggle(flag);
        };
    };
};

exports.on = function(evt) {
    return function(act) {
        return function(ob) {
            return function() {
                ob.on(evt, function(e) {
                    act(e)(jQuery(this))();
                });
            };
        };
    };
};

exports["on'"] = function(evt) {
    return function(sel) {
        return function(act) {
            return function(ob) {
                return function() {
                    ob.on(evt, sel, function(e) {
                        act(e)(jQuery(this))();
                    });
                };
            };
        };
    };
};

exports.preventDefault = function(e) {
    return function() {
        e.preventDefault();
    };
};

exports.stopPropagation = function(e) {
    return function() {
        e.stopPropagation();
    };
};

exports.stopImmediatePropagation = function(e) {
    return function() {
        e.stopImmediatePropagation();
    };
};

},{}],39:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Foreign = require("../Data.Foreign");
var DOM = require("../DOM");
var removeClass = function (cls) {
    return $foreign.setClass(cls)(false);
};
var hide = $foreign.setVisible(false);
var display = $foreign.setVisible(true);
var addClass = function (cls) {
    return $foreign.setClass(cls)(true);
};
module.exports = {
    addClass: addClass, 
    display: display, 
    hide: hide, 
    removeClass: removeClass, 
    append: $foreign.append, 
    appendText: $foreign.appendText, 
    attr: $foreign.attr, 
    before: $foreign.before, 
    body: $foreign.body, 
    clear: $foreign.clear, 
    closest: $foreign.closest, 
    create: $foreign.create, 
    css: $foreign.css, 
    find: $foreign.find, 
    getHtml: $foreign.getHtml, 
    getProp: $foreign.getProp, 
    getText: $foreign.getText, 
    getValue: $foreign.getValue, 
    hasClass: $foreign.hasClass, 
    on: $foreign.on, 
    "on'": $foreign["on'"], 
    parent: $foreign.parent, 
    preventDefault: $foreign.preventDefault, 
    ready: $foreign.ready, 
    remove: $foreign.remove, 
    select: $foreign.select, 
    setAttr: $foreign.setAttr, 
    setClass: $foreign.setClass, 
    setHtml: $foreign.setHtml, 
    setProp: $foreign.setProp, 
    setText: $foreign.setText, 
    setValue: $foreign.setValue, 
    setVisible: $foreign.setVisible, 
    stopImmediatePropagation: $foreign.stopImmediatePropagation, 
    stopPropagation: $foreign.stopPropagation, 
    toggle: $foreign.toggle, 
    toggleClass: $foreign.toggleClass
};

},{"../Control.Monad.Eff":47,"../DOM":69,"../Data.Foreign":88,"../Prelude":144,"./foreign":38}],40:[function(require,module,exports){
/* global exports */
"use strict";

// module Control.Monad.Eff.Ref

exports.newRef = function (val) {
  return function () {
    return { value: val };
  };
};

exports.readRef = function (ref) {
  return function () {
    return ref.value;
  };
};

exports["modifyRef'"] = function (ref) {
  return function (f) {
    return function () {
      var t = f(ref.value);
      ref.value = t.state;
      return t.value;
    };
  };
};

exports.writeRef = function (ref) {
  return function (val) {
    return function () {
      ref.value = val;
      return {};
    };
  };
};

},{}],41:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Unit = require("../Data.Unit");
var modifyRef = function (ref) {
    return function (f) {
        return $foreign["modifyRef'"](ref)(function (s) {
            return {
                state: f(s), 
                value: Data_Unit.unit
            };
        });
    };
};
module.exports = {
    modifyRef: modifyRef, 
    "modifyRef'": $foreign["modifyRef'"], 
    newRef: $foreign.newRef, 
    readRef: $foreign.readRef, 
    writeRef: $foreign.writeRef
};

},{"../Control.Monad.Eff":47,"../Data.Unit":135,"../Prelude":144,"./foreign":40}],42:[function(require,module,exports){
/* global exports */
"use strict";

exports.setTimeout = function (ms) {
  return function (fn) {
    return function () {
      return setTimeout(fn, ms);
    };
  };
};

exports.clearTimeout = function (id) {
  return function () {
    clearTimeout(id);
  };
};

exports.setInterval = function (ms) {
  return function (fn) {
    return function () {
      return setInterval(fn, ms);
    };
  };
};

exports.clearInterval = function (id) {
  return function () {
    clearInterval(id);
  };
};

},{}],43:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Data_Eq = require("../Data.Eq");
var Data_Ord = require("../Data.Ord");
var TimeoutId = function (x) {
    return x;
};
var IntervalId = function (x) {
    return x;
};
var eqTimeoutId = new Data_Eq.Eq(function (x) {
    return function (y) {
        return x === y;
    };
});
var ordTimeoutId = new Data_Ord.Ord(function () {
    return eqTimeoutId;
}, function (x) {
    return function (y) {
        return Data_Ord.compare(Data_Ord.ordInt)(x)(y);
    };
});
var eqIntervalId = new Data_Eq.Eq(function (x) {
    return function (y) {
        return x === y;
    };
});
var ordIntervalId = new Data_Ord.Ord(function () {
    return eqIntervalId;
}, function (x) {
    return function (y) {
        return Data_Ord.compare(Data_Ord.ordInt)(x)(y);
    };
});
module.exports = {
    eqTimeoutId: eqTimeoutId, 
    ordTimeoutId: ordTimeoutId, 
    eqIntervalId: eqIntervalId, 
    ordIntervalId: ordIntervalId, 
    clearInterval: $foreign.clearInterval, 
    clearTimeout: $foreign.clearTimeout, 
    setInterval: $foreign.setInterval, 
    setTimeout: $foreign.setTimeout
};

},{"../Control.Monad.Eff":47,"../Data.Eq":81,"../Data.Ord":116,"../Prelude":144,"./foreign":42}],44:[function(require,module,exports){
"use strict";

// module Control.Monad.Eff.Unsafe

exports.unsafeInterleaveEff = function (f) {
  return f;
};

},{}],45:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var unsafePerformEff = function ($0) {
    return Control_Monad_Eff.runPure($foreign.unsafeInterleaveEff($0));
};
module.exports = {
    unsafePerformEff: unsafePerformEff, 
    unsafeInterleaveEff: $foreign.unsafeInterleaveEff
};

},{"../Control.Monad.Eff":47,"../Control.Semigroupoid":66,"./foreign":44}],46:[function(require,module,exports){
"use strict";

// module Control.Monad.Eff

exports.pureE = function (a) {
  return function () {
    return a;
  };
};

exports.bindE = function (a) {
  return function (f) {
    return function () {
      return f(a())();
    };
  };
};

exports.runPure = function (f) {
  return f();
};

exports.untilE = function (f) {
  return function () {
    while (!f());
    return {};
  };
};

exports.whileE = function (f) {
  return function (a) {
    return function () {
      while (f()) {
        a();
      }
      return {};
    };
  };
};

exports.forE = function (lo) {
  return function (hi) {
    return function (f) {
      return function () {
        for (var i = lo; i < hi; i++) {
          f(i)();
        }
      };
    };
  };
};

exports.foreachE = function (as) {
  return function (f) {
    return function () {
      for (var i = 0, l = as.length; i < l; i++) {
        f(as[i])();
      }
    };
  };
};

},{}],47:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var monadEff = new Control_Monad.Monad(function () {
    return applicativeEff;
}, function () {
    return bindEff;
});
var bindEff = new Control_Bind.Bind(function () {
    return applyEff;
}, $foreign.bindE);
var applyEff = new Control_Apply.Apply(function () {
    return functorEff;
}, Control_Monad.ap(monadEff));
var applicativeEff = new Control_Applicative.Applicative(function () {
    return applyEff;
}, $foreign.pureE);
var functorEff = new Data_Functor.Functor(Control_Applicative.liftA1(applicativeEff));
module.exports = {
    functorEff: functorEff, 
    applyEff: applyEff, 
    applicativeEff: applicativeEff, 
    bindEff: bindEff, 
    monadEff: monadEff, 
    forE: $foreign.forE, 
    foreachE: $foreign.foreachE, 
    runPure: $foreign.runPure, 
    untilE: $foreign.untilE, 
    whileE: $foreign.whileE
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Data.Functor":94,"../Data.Unit":135,"./foreign":46}],48:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var Data_Maybe = require("../Data.Maybe");
var Data_Either = require("../Data.Either");
var Data_Function = require("../Data.Function");
var Data_Unit = require("../Data.Unit");
var MonadError = function (__superclass_Control$dotMonad$dotMonad_0, catchError, throwError) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.catchError = catchError;
    this.throwError = throwError;
};
var throwError = function (dict) {
    return dict.throwError;
};
var monadErrorMaybe = new MonadError(function () {
    return Data_Maybe.monadMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Data_Maybe.Nothing) {
            return v1(Data_Unit.unit);
        };
        if (v instanceof Data_Maybe.Just) {
            return new Data_Maybe.Just(v.value0);
        };
        throw new Error("Failed pattern match at Control.Monad.Error.Class line 55, column 3 - line 55, column 33: " + [ v.constructor.name, v1.constructor.name ]);
    };
}, Data_Function["const"](Data_Maybe.Nothing.value));
var monadErrorEither = new MonadError(function () {
    return Data_Either.monadEither;
}, function (v) {
    return function (v1) {
        if (v instanceof Data_Either.Left) {
            return v1(v.value0);
        };
        if (v instanceof Data_Either.Right) {
            return new Data_Either.Right(v.value0);
        };
        throw new Error("Failed pattern match at Control.Monad.Error.Class line 50, column 3 - line 50, column 30: " + [ v.constructor.name, v1.constructor.name ]);
    };
}, Data_Either.Left.create);
var catchError = function (dict) {
    return dict.catchError;
};
var catchJust = function (dictMonadError) {
    return function (p) {
        return function (act) {
            return function (handler) {
                var handle = function (e) {
                    var $12 = p(e);
                    if ($12 instanceof Data_Maybe.Nothing) {
                        return throwError(dictMonadError)(e);
                    };
                    if ($12 instanceof Data_Maybe.Just) {
                        return handler($12.value0);
                    };
                    throw new Error("Failed pattern match at Control.Monad.Error.Class line 44, column 5 - line 46, column 26: " + [ $12.constructor.name ]);
                };
                return catchError(dictMonadError)(act)(handle);
            };
        };
    };
};
module.exports = {
    MonadError: MonadError, 
    catchError: catchError, 
    catchJust: catchJust, 
    throwError: throwError, 
    monadErrorEither: monadErrorEither, 
    monadErrorMaybe: monadErrorMaybe
};

},{"../Data.Either":79,"../Data.Function":91,"../Data.Maybe":104,"../Data.Unit":135,"../Prelude":144}],49:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_RWS_Class = require("../Control.Monad.RWS.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans = require("../Control.Monad.Trans");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Either = require("../Data.Either");
var Data_Monoid = require("../Data.Monoid");
var Data_Tuple = require("../Data.Tuple");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Function = require("../Data.Function");
var Control_Category = require("../Control.Category");
var ExceptT = function (x) {
    return x;
};
var withExceptT = function (dictFunctor) {
    return function (f) {
        return function (v) {
            var mapLeft = function (v1) {
                return function (v2) {
                    if (v2 instanceof Data_Either.Right) {
                        return new Data_Either.Right(v2.value0);
                    };
                    if (v2 instanceof Data_Either.Left) {
                        return new Data_Either.Left(v1(v2.value0));
                    };
                    throw new Error("Failed pattern match at Control.Monad.Except.Trans line 44, column 3 - line 44, column 32: " + [ v1.constructor.name, v2.constructor.name ]);
                };
            };
            return Data_Function.apply(ExceptT)(Data_Functor.map(dictFunctor)(mapLeft(f))(v));
        };
    };
};
var runExceptT = function (v) {
    return v;
};
var monadTransExceptT = new Control_Monad_Trans.MonadTrans(function (dictMonad) {
    return function (m) {
        return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(m)(function (v) {
            return Data_Function.apply(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]()))(new Data_Either.Right(v));
        });
    };
});
var mapExceptT = function (f) {
    return function (v) {
        return f(v);
    };
};
var functorExceptT = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return mapExceptT(Data_Functor.map(dictFunctor)(Data_Functor.map(Data_Either.functorEither)(f)));
    });
};
var except = function (dictApplicative) {
    return function ($87) {
        return ExceptT(Control_Applicative.pure(dictApplicative)($87));
    };
};
var applyExceptT = function (dictApply) {
    return new Control_Apply.Apply(function () {
        return functorExceptT(dictApply["__superclass_Data.Functor.Functor_0"]());
    }, function (v) {
        return function (v1) {
            var f$prime = Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(Control_Apply.apply(Data_Either.applyEither))(v);
            var x$prime = Control_Apply.apply(dictApply)(f$prime)(v1);
            return x$prime;
        };
    });
};
var bindExceptT = function (dictMonad) {
    return new Control_Bind.Bind(function () {
        return applyExceptT((dictMonad["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]());
    }, function (v) {
        return function (k) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(Data_Either.either(function ($88) {
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Either.Left.create($88));
            })(function (a) {
                var $56 = k(a);
                return $56;
            }));
        };
    });
};
var applicativeExceptT = function (dictApplicative) {
    return new Control_Applicative.Applicative(function () {
        return applyExceptT(dictApplicative["__superclass_Control.Apply.Apply_0"]());
    }, function ($89) {
        return ExceptT(Control_Applicative.pure(dictApplicative)(Data_Either.Right.create($89)));
    });
};
var monadExceptT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeExceptT(dictMonad["__superclass_Control.Applicative.Applicative_0"]());
    }, function () {
        return bindExceptT(dictMonad);
    });
};
var monadContExceptT = function (dictMonadCont) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadExceptT(dictMonadCont["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return Data_Function.apply(ExceptT)(Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
            var $57 = f(function (a) {
                return Data_Function.apply(ExceptT)(c(new Data_Either.Right(a)));
            });
            return $57;
        }));
    });
};
var monadEffExceptT = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadExceptT(dictMonadEff["__superclass_Control.Monad.Monad_0"]());
    }, function ($90) {
        return Control_Monad_Trans.lift(monadTransExceptT)(dictMonadEff["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($90));
    });
};
var monadErrorExceptT = function (dictMonad) {
    return new Control_Monad_Error_Class.MonadError(function () {
        return monadExceptT(dictMonad);
    }, function (v) {
        return function (k) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(Data_Either.either(function (a) {
                var $60 = k(a);
                return $60;
            })(function ($91) {
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Either.Right.create($91));
            }));
        };
    }, function ($92) {
        return ExceptT(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Either.Left.create($92)));
    });
};
var monadReaderExceptT = function (dictMonadReader) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadExceptT(dictMonadReader["__superclass_Control.Monad.Monad_0"]());
    }, Control_Monad_Trans.lift(monadTransExceptT)(dictMonadReader["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Reader_Class.ask(dictMonadReader)), function (f) {
        return mapExceptT(Control_Monad_Reader_Class.local(dictMonadReader)(f));
    });
};
var monadRecExceptT = function (dictMonadRec) {
    return new Control_Monad_Rec_Class.MonadRec(function () {
        return monadExceptT(dictMonadRec["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return function ($93) {
            return ExceptT(Control_Monad_Rec_Class.tailRecM(dictMonadRec)(function (a) {
                return Control_Bind.bind((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())((function () {
                    var $61 = f(a);
                    return $61;
                })())(function (m$prime) {
                    return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())((function () {
                        if (m$prime instanceof Data_Either.Left) {
                            return new Data_Either.Right(new Data_Either.Left(m$prime.value0));
                        };
                        if (m$prime instanceof Data_Either.Right && m$prime.value0 instanceof Data_Either.Left) {
                            return new Data_Either.Left(m$prime.value0.value0);
                        };
                        if (m$prime instanceof Data_Either.Right && m$prime.value0 instanceof Data_Either.Right) {
                            return new Data_Either.Right(new Data_Either.Right(m$prime.value0.value0));
                        };
                        throw new Error("Failed pattern match at Control.Monad.Except.Trans line 77, column 9 - line 80, column 45: " + [ m$prime.constructor.name ]);
                    })());
                });
            })($93));
        };
    });
};
var monadStateExceptT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadExceptT(dictMonadState["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return Control_Monad_Trans.lift(monadTransExceptT)(dictMonadState["__superclass_Control.Monad.Monad_0"]())(Control_Monad_State_Class.state(dictMonadState)(f));
    });
};
var monadWriterExceptT = function (dictMonadWriter) {
    return new Control_Monad_Writer_Class.MonadWriter(function () {
        return monadExceptT(dictMonadWriter["__superclass_Control.Monad.Monad_0"]());
    }, mapExceptT(function (m) {
        return Control_Bind.bind((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Writer_Class.listen(dictMonadWriter)(m))(function (v) {
            return Data_Function.apply(Control_Applicative.pure((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]()))(Data_Functor.map(Data_Either.functorEither)(function (r) {
                return new Data_Tuple.Tuple(r, v.value1);
            })(v.value0));
        });
    }), mapExceptT(function (m) {
        return Control_Monad_Writer_Class.pass(dictMonadWriter)(Control_Bind.bind((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(m)(function (v) {
            return Control_Applicative.pure((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())((function () {
                if (v instanceof Data_Either.Left) {
                    return new Data_Tuple.Tuple(new Data_Either.Left(v.value0), Control_Category.id(Control_Category.categoryFn));
                };
                if (v instanceof Data_Either.Right) {
                    return new Data_Tuple.Tuple(new Data_Either.Right(v.value0.value0), v.value0.value1);
                };
                throw new Error("Failed pattern match at Control.Monad.Except.Trans line 133, column 5 - line 135, column 45: " + [ v.constructor.name ]);
            })());
        }));
    }), function (wd) {
        return Control_Monad_Trans.lift(monadTransExceptT)(dictMonadWriter["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Writer_Class.writer(dictMonadWriter)(wd));
    });
};
var monadRWSExceptT = function (dictMonadRWS) {
    return new Control_Monad_RWS_Class.MonadRWS(function () {
        return monadReaderExceptT(dictMonadRWS["__superclass_Control.Monad.Reader.Class.MonadReader_0"]());
    }, function () {
        return monadStateExceptT(dictMonadRWS["__superclass_Control.Monad.State.Class.MonadState_2"]());
    }, function () {
        return monadWriterExceptT(dictMonadRWS["__superclass_Control.Monad.Writer.Class.MonadWriter_1"]());
    });
};
var altExceptT = function (dictSemigroup) {
    return function (dictMonad) {
        return new Control_Alt.Alt(function () {
            return functorExceptT(((dictMonad["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]());
        }, function (v) {
            return function (v1) {
                return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v2) {
                    if (v2 instanceof Data_Either.Right) {
                        return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Right(v2.value0));
                    };
                    if (v2 instanceof Data_Either.Left) {
                        return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v1)(function (v3) {
                            if (v3 instanceof Data_Either.Right) {
                                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Right(v3.value0));
                            };
                            if (v3 instanceof Data_Either.Left) {
                                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(new Data_Either.Left(Data_Semigroup.append(dictSemigroup)(v2.value0)(v3.value0)));
                            };
                            throw new Error("Failed pattern match at Control.Monad.Except.Trans line 89, column 9 - line 91, column 49: " + [ v3.constructor.name ]);
                        });
                    };
                    throw new Error("Failed pattern match at Control.Monad.Except.Trans line 85, column 5 - line 91, column 49: " + [ v2.constructor.name ]);
                });
            };
        });
    };
};
var plusExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Plus.Plus(function () {
            return altExceptT(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(dictMonad);
        }, Control_Monad_Error_Class.throwError(monadErrorExceptT(dictMonad))(Data_Monoid.mempty(dictMonoid)));
    };
};
var alternativeExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Alternative.Alternative(function () {
            return applicativeExceptT(dictMonad["__superclass_Control.Applicative.Applicative_0"]());
        }, function () {
            return plusExceptT(dictMonoid)(dictMonad);
        });
    };
};
var monadZeroExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_MonadZero.MonadZero(function () {
            return alternativeExceptT(dictMonoid)(dictMonad);
        }, function () {
            return monadExceptT(dictMonad);
        });
    };
};
var monadPlusExceptT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_MonadPlus.MonadPlus(function () {
            return monadZeroExceptT(dictMonoid)(dictMonad);
        });
    };
};
module.exports = {
    ExceptT: ExceptT, 
    except: except, 
    mapExceptT: mapExceptT, 
    runExceptT: runExceptT, 
    withExceptT: withExceptT, 
    functorExceptT: functorExceptT, 
    applyExceptT: applyExceptT, 
    applicativeExceptT: applicativeExceptT, 
    bindExceptT: bindExceptT, 
    monadExceptT: monadExceptT, 
    monadRecExceptT: monadRecExceptT, 
    altExceptT: altExceptT, 
    plusExceptT: plusExceptT, 
    alternativeExceptT: alternativeExceptT, 
    monadPlusExceptT: monadPlusExceptT, 
    monadZeroExceptT: monadZeroExceptT, 
    monadTransExceptT: monadTransExceptT, 
    monadEffExceptT: monadEffExceptT, 
    monadContExceptT: monadContExceptT, 
    monadErrorExceptT: monadErrorExceptT, 
    monadReaderExceptT: monadReaderExceptT, 
    monadStateExceptT: monadStateExceptT, 
    monadWriterExceptT: monadWriterExceptT, 
    monadRWSExceptT: monadRWSExceptT
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Monad":61,"../Control.Monad.Cont.Class":31,"../Control.Monad.Eff.Class":33,"../Control.Monad.Error.Class":48,"../Control.Monad.RWS.Class":51,"../Control.Monad.Reader.Class":52,"../Control.Monad.Rec.Class":54,"../Control.Monad.State.Class":57,"../Control.Monad.Trans":58,"../Control.Monad.Writer.Class":59,"../Control.MonadPlus":62,"../Control.MonadZero":63,"../Control.Plus":65,"../Control.Semigroupoid":66,"../Data.Either":79,"../Data.Function":91,"../Data.Functor":94,"../Data.Monoid":111,"../Data.Semigroup":121,"../Data.Tuple":133,"../Prelude":144}],50:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_RWS_Class = require("../Control.Monad.RWS.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans = require("../Control.Monad.Trans");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Either = require("../Data.Either");
var Data_Maybe = require("../Data.Maybe");
var Data_Tuple = require("../Data.Tuple");
var Data_Functor = require("../Data.Functor");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Monad = require("../Control.Monad");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Bind = require("../Control.Bind");
var Data_Function = require("../Data.Function");
var Control_Category = require("../Control.Category");
var MaybeT = function (x) {
    return x;
};
var runMaybeT = function (v) {
    return v;
};
var monadTransMaybeT = new Control_Monad_Trans.MonadTrans(function (dictMonad) {
    return function ($60) {
        return MaybeT(Control_Monad.liftM1(dictMonad)(Data_Maybe.Just.create)($60));
    };
});
var mapMaybeT = function (f) {
    return function (v) {
        return f(v);
    };
};
var monadMaybeT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeMaybeT(dictMonad);
    }, function () {
        return bindMaybeT(dictMonad);
    });
};
var functorMaybeT = function (dictMonad) {
    return new Data_Functor.Functor(Control_Applicative.liftA1(applicativeMaybeT(dictMonad)));
};
var bindMaybeT = function (dictMonad) {
    return new Control_Bind.Bind(function () {
        return applyMaybeT(dictMonad);
    }, function (v) {
        return function (f) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v1) {
                if (v1 instanceof Data_Maybe.Nothing) {
                    return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Maybe.Nothing.value);
                };
                if (v1 instanceof Data_Maybe.Just) {
                    var $36 = f(v1.value0);
                    return $36;
                };
                throw new Error("Failed pattern match at Control.Monad.Maybe.Trans line 55, column 5 - line 58, column 22: " + [ v1.constructor.name ]);
            });
        };
    });
};
var applyMaybeT = function (dictMonad) {
    return new Control_Apply.Apply(function () {
        return functorMaybeT(dictMonad);
    }, Control_Monad.ap(monadMaybeT(dictMonad)));
};
var applicativeMaybeT = function (dictMonad) {
    return new Control_Applicative.Applicative(function () {
        return applyMaybeT(dictMonad);
    }, function ($61) {
        return MaybeT(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Maybe.Just.create($61)));
    });
};
var monadContMaybeT = function (dictMonadCont) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadMaybeT(dictMonadCont["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return Data_Function.apply(MaybeT)(Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
            var $38 = f(function (a) {
                return Data_Function.apply(MaybeT)(Data_Function.apply(c)(new Data_Maybe.Just(a)));
            });
            return $38;
        }));
    });
};
var monadEffMaybe = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadMaybeT(dictMonadEff["__superclass_Control.Monad.Monad_0"]());
    }, function ($62) {
        return Control_Monad_Trans.lift(monadTransMaybeT)(dictMonadEff["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($62));
    });
};
var monadErrorMaybeT = function (dictMonadError) {
    return new Control_Monad_Error_Class.MonadError(function () {
        return monadMaybeT(dictMonadError["__superclass_Control.Monad.Monad_0"]());
    }, function (v) {
        return function (h) {
            return Data_Function.apply(MaybeT)(Control_Monad_Error_Class.catchError(dictMonadError)(v)(function (a) {
                var $41 = h(a);
                return $41;
            }));
        };
    }, function (e) {
        return Control_Monad_Trans.lift(monadTransMaybeT)(dictMonadError["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Error_Class.throwError(dictMonadError)(e));
    });
};
var monadReaderMaybeT = function (dictMonadReader) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadMaybeT(dictMonadReader["__superclass_Control.Monad.Monad_0"]());
    }, Control_Monad_Trans.lift(monadTransMaybeT)(dictMonadReader["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Reader_Class.ask(dictMonadReader)), function (f) {
        return mapMaybeT(Control_Monad_Reader_Class.local(dictMonadReader)(f));
    });
};
var monadRecMaybeT = function (dictMonadRec) {
    return new Control_Monad_Rec_Class.MonadRec(function () {
        return monadMaybeT(dictMonadRec["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return function ($63) {
            return MaybeT(Control_Monad_Rec_Class.tailRecM(dictMonadRec)(function (a) {
                var $42 = f(a);
                return Control_Bind.bind((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())($42)(function (m$prime) {
                    return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())((function () {
                        if (m$prime instanceof Data_Maybe.Nothing) {
                            return new Data_Either.Right(Data_Maybe.Nothing.value);
                        };
                        if (m$prime instanceof Data_Maybe.Just && m$prime.value0 instanceof Data_Either.Left) {
                            return new Data_Either.Left(m$prime.value0.value0);
                        };
                        if (m$prime instanceof Data_Maybe.Just && m$prime.value0 instanceof Data_Either.Right) {
                            return new Data_Either.Right(new Data_Maybe.Just(m$prime.value0.value0));
                        };
                        throw new Error("Failed pattern match at Control.Monad.Maybe.Trans line 86, column 11 - line 89, column 45: " + [ m$prime.constructor.name ]);
                    })());
                });
            })($63));
        };
    });
};
var monadStateMaybeT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadMaybeT(dictMonadState["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return Control_Monad_Trans.lift(monadTransMaybeT)(dictMonadState["__superclass_Control.Monad.Monad_0"]())(Control_Monad_State_Class.state(dictMonadState)(f));
    });
};
var monadWriterMaybeT = function (dictMonadWriter) {
    return new Control_Monad_Writer_Class.MonadWriter(function () {
        return monadMaybeT(dictMonadWriter["__superclass_Control.Monad.Monad_0"]());
    }, mapMaybeT(function (m) {
        return Control_Bind.bind((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(Control_Monad_Writer_Class.listen(dictMonadWriter)(m))(function (v) {
            return Data_Function.apply(Control_Applicative.pure((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]()))(Data_Functor.map(Data_Maybe.functorMaybe)(function (r) {
                return new Data_Tuple.Tuple(r, v.value1);
            })(v.value0));
        });
    }), mapMaybeT(function (m) {
        return Control_Monad_Writer_Class.pass(dictMonadWriter)(Control_Bind.bind((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(m)(function (v) {
            return Control_Applicative.pure((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())((function () {
                if (v instanceof Data_Maybe.Nothing) {
                    return new Data_Tuple.Tuple(Data_Maybe.Nothing.value, Control_Category.id(Control_Category.categoryFn));
                };
                if (v instanceof Data_Maybe.Just) {
                    return new Data_Tuple.Tuple(new Data_Maybe.Just(v.value0.value0), v.value0.value1);
                };
                throw new Error("Failed pattern match at Control.Monad.Maybe.Trans line 117, column 5 - line 119, column 43: " + [ v.constructor.name ]);
            })());
        }));
    }), function (wd) {
        return Control_Monad_Trans.lift(monadTransMaybeT)(dictMonadWriter["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Writer_Class.writer(dictMonadWriter)(wd));
    });
};
var monadRWSMaybeT = function (dictMonadRWS) {
    return new Control_Monad_RWS_Class.MonadRWS(function () {
        return monadReaderMaybeT(dictMonadRWS["__superclass_Control.Monad.Reader.Class.MonadReader_0"]());
    }, function () {
        return monadStateMaybeT(dictMonadRWS["__superclass_Control.Monad.State.Class.MonadState_2"]());
    }, function () {
        return monadWriterMaybeT(dictMonadRWS["__superclass_Control.Monad.Writer.Class.MonadWriter_1"]());
    });
};
var altMaybeT = function (dictMonad) {
    return new Control_Alt.Alt(function () {
        return functorMaybeT(dictMonad);
    }, function (v) {
        return function (v1) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v2) {
                if (v2 instanceof Data_Maybe.Nothing) {
                    return v1;
                };
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(v2);
            });
        };
    });
};
var plusMaybeT = function (dictMonad) {
    return new Control_Plus.Plus(function () {
        return altMaybeT(dictMonad);
    }, Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(Data_Maybe.Nothing.value));
};
var alternativeMaybeT = function (dictMonad) {
    return new Control_Alternative.Alternative(function () {
        return applicativeMaybeT(dictMonad);
    }, function () {
        return plusMaybeT(dictMonad);
    });
};
var monadZeroMaybeT = function (dictMonad) {
    return new Control_MonadZero.MonadZero(function () {
        return alternativeMaybeT(dictMonad);
    }, function () {
        return monadMaybeT(dictMonad);
    });
};
var monadPlusMaybeT = function (dictMonad) {
    return new Control_MonadPlus.MonadPlus(function () {
        return monadZeroMaybeT(dictMonad);
    });
};
module.exports = {
    MaybeT: MaybeT, 
    mapMaybeT: mapMaybeT, 
    runMaybeT: runMaybeT, 
    functorMaybeT: functorMaybeT, 
    applyMaybeT: applyMaybeT, 
    applicativeMaybeT: applicativeMaybeT, 
    bindMaybeT: bindMaybeT, 
    monadMaybeT: monadMaybeT, 
    monadTransMaybeT: monadTransMaybeT, 
    altMaybeT: altMaybeT, 
    plusMaybeT: plusMaybeT, 
    alternativeMaybeT: alternativeMaybeT, 
    monadPlusMaybeT: monadPlusMaybeT, 
    monadZeroMaybeT: monadZeroMaybeT, 
    monadRecMaybeT: monadRecMaybeT, 
    monadEffMaybe: monadEffMaybe, 
    monadContMaybeT: monadContMaybeT, 
    monadErrorMaybeT: monadErrorMaybeT, 
    monadReaderMaybeT: monadReaderMaybeT, 
    monadStateMaybeT: monadStateMaybeT, 
    monadWriterMaybeT: monadWriterMaybeT, 
    monadRWSMaybeT: monadRWSMaybeT
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Monad":61,"../Control.Monad.Cont.Class":31,"../Control.Monad.Eff.Class":33,"../Control.Monad.Error.Class":48,"../Control.Monad.RWS.Class":51,"../Control.Monad.Reader.Class":52,"../Control.Monad.Rec.Class":54,"../Control.Monad.State.Class":57,"../Control.Monad.Trans":58,"../Control.Monad.Writer.Class":59,"../Control.MonadPlus":62,"../Control.MonadZero":63,"../Control.Plus":65,"../Control.Semigroupoid":66,"../Data.Either":79,"../Data.Function":91,"../Data.Functor":94,"../Data.Maybe":104,"../Data.Tuple":133,"../Prelude":144}],51:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans = require("../Control.Monad.Trans");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var MonadRWS = function (__superclass_Control$dotMonad$dotReader$dotClass$dotMonadReader_0, __superclass_Control$dotMonad$dotState$dotClass$dotMonadState_2, __superclass_Control$dotMonad$dotWriter$dotClass$dotMonadWriter_1) {
    this["__superclass_Control.Monad.Reader.Class.MonadReader_0"] = __superclass_Control$dotMonad$dotReader$dotClass$dotMonadReader_0;
    this["__superclass_Control.Monad.State.Class.MonadState_2"] = __superclass_Control$dotMonad$dotState$dotClass$dotMonadState_2;
    this["__superclass_Control.Monad.Writer.Class.MonadWriter_1"] = __superclass_Control$dotMonad$dotWriter$dotClass$dotMonadWriter_1;
};
module.exports = {
    MonadRWS: MonadRWS
};

},{"../Control.Monad.Reader.Class":52,"../Control.Monad.State.Class":57,"../Control.Monad.Trans":58,"../Control.Monad.Writer.Class":59}],52:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var Control_Category = require("../Control.Category");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Monad = require("../Control.Monad");
var Control_Bind = require("../Control.Bind");
var Control_Applicative = require("../Control.Applicative");
var MonadReader = function (__superclass_Control$dotMonad$dotMonad_0, ask, local) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.ask = ask;
    this.local = local;
};
var monadReaderFun = new MonadReader(function () {
    return Control_Monad.monadFn;
}, Control_Category.id(Control_Category.categoryFn), Control_Semigroupoid.composeFlipped(Control_Semigroupoid.semigroupoidFn));
var local = function (dict) {
    return dict.local;
};
var ask = function (dict) {
    return dict.ask;
};
var reader = function (dictMonadReader) {
    return function (f) {
        return Control_Bind.bindFlipped((dictMonadReader["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(function ($1) {
            return Control_Applicative.pure((dictMonadReader["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(f($1));
        })(ask(dictMonadReader));
    };
};
module.exports = {
    MonadReader: MonadReader, 
    ask: ask, 
    local: local, 
    reader: reader, 
    monadReaderFun: monadReaderFun
};

},{"../Control.Applicative":14,"../Control.Bind":20,"../Control.Category":21,"../Control.Monad":61,"../Control.Semigroupoid":66,"../Prelude":144}],53:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans = require("../Control.Monad.Trans");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Distributive = require("../Data.Distributive");
var Data_Either = require("../Data.Either");
var Data_Functor = require("../Data.Functor");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Apply = require("../Control.Apply");
var Control_Applicative = require("../Control.Applicative");
var Data_Function = require("../Data.Function");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var ReaderT = function (x) {
    return x;
};
var withReaderT = function (f) {
    return function (v) {
        return function ($48) {
            return v(f($48));
        };
    };
};
var runReaderT = function (v) {
    return v;
};
var monadTransReaderT = new Control_Monad_Trans.MonadTrans(function (dictMonad) {
    return function ($49) {
        return ReaderT(Data_Function["const"]($49));
    };
});
var mapReaderT = function (f) {
    return function (v) {
        return function ($50) {
            return f(v($50));
        };
    };
};
var functorReaderT = function (dictFunctor) {
    return new Data_Functor.Functor(function ($51) {
        return mapReaderT(Data_Functor.map(dictFunctor)($51));
    });
};
var distributiveReaderT = function (dictDistributive) {
    return new Data_Distributive.Distributive(function () {
        return functorReaderT(dictDistributive["__superclass_Data.Functor.Functor_0"]());
    }, function (dictFunctor) {
        return function (f) {
            return function ($52) {
                return Data_Distributive.distribute(distributiveReaderT(dictDistributive))(dictFunctor)(Data_Functor.map(dictFunctor)(f)($52));
            };
        };
    }, function (dictFunctor) {
        return function (a) {
            return function (e) {
                return Data_Distributive.collect(dictDistributive)(dictFunctor)(function (r) {
                    return r(e);
                })(a);
            };
        };
    });
};
var applyReaderT = function (dictApply) {
    return new Control_Apply.Apply(function () {
        return functorReaderT(dictApply["__superclass_Data.Functor.Functor_0"]());
    }, function (v) {
        return function (v1) {
            return function (r) {
                return Control_Apply.apply(dictApply)(v(r))(v1(r));
            };
        };
    });
};
var bindReaderT = function (dictBind) {
    return new Control_Bind.Bind(function () {
        return applyReaderT(dictBind["__superclass_Control.Apply.Apply_0"]());
    }, function (v) {
        return function (k) {
            return function (r) {
                return Control_Bind.bind(dictBind)(v(r))(function (a) {
                    var $40 = k(a);
                    return $40(r);
                });
            };
        };
    });
};
var applicativeReaderT = function (dictApplicative) {
    return new Control_Applicative.Applicative(function () {
        return applyReaderT(dictApplicative["__superclass_Control.Apply.Apply_0"]());
    }, function ($53) {
        return ReaderT(Data_Function["const"](Control_Applicative.pure(dictApplicative)($53)));
    });
};
var monadReaderT = function (dictMonad) {
    return new Control_Monad.Monad(function () {
        return applicativeReaderT(dictMonad["__superclass_Control.Applicative.Applicative_0"]());
    }, function () {
        return bindReaderT(dictMonad["__superclass_Control.Bind.Bind_1"]());
    });
};
var monadContReaderT = function (dictMonadCont) {
    return new Control_Monad_Cont_Class.MonadCont(function () {
        return monadReaderT(dictMonadCont["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return function (r) {
            return Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
                var $41 = f(function ($54) {
                    return ReaderT(Data_Function["const"](c($54)));
                });
                return $41(r);
            });
        };
    });
};
var monadEffReader = function (dictMonadEff) {
    return new Control_Monad_Eff_Class.MonadEff(function () {
        return monadReaderT(dictMonadEff["__superclass_Control.Monad.Monad_0"]());
    }, function ($55) {
        return Control_Monad_Trans.lift(monadTransReaderT)(dictMonadEff["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($55));
    });
};
var monadErrorReaderT = function (dictMonadError) {
    return new Control_Monad_Error_Class.MonadError(function () {
        return monadReaderT(dictMonadError["__superclass_Control.Monad.Monad_0"]());
    }, function (v) {
        return function (h) {
            return function (r) {
                return Control_Monad_Error_Class.catchError(dictMonadError)(v(r))(function (e) {
                    var $44 = h(e);
                    return $44(r);
                });
            };
        };
    }, function ($56) {
        return Control_Monad_Trans.lift(monadTransReaderT)(dictMonadError["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Error_Class.throwError(dictMonadError)($56));
    });
};
var monadReaderReaderT = function (dictMonad) {
    return new Control_Monad_Reader_Class.MonadReader(function () {
        return monadReaderT(dictMonad);
    }, Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]()), withReaderT);
};
var monadRecReaderT = function (dictMonadRec) {
    return new Control_Monad_Rec_Class.MonadRec(function () {
        return monadReaderT(dictMonadRec["__superclass_Control.Monad.Monad_0"]());
    }, function (k) {
        return function (a) {
            var k$prime = function (r) {
                return function (a1) {
                    var $45 = k(a1);
                    return Control_Bind.bindFlipped((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(function ($57) {
                        return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())(Data_Either.either(Data_Either.Left.create)(Data_Either.Right.create)($57));
                    })($45(r));
                };
            };
            return function (r) {
                return Control_Monad_Rec_Class.tailRecM(dictMonadRec)(k$prime(r))(a);
            };
        };
    });
};
var monadStateReaderT = function (dictMonadState) {
    return new Control_Monad_State_Class.MonadState(function () {
        return monadReaderT(dictMonadState["__superclass_Control.Monad.Monad_0"]());
    }, function ($58) {
        return Control_Monad_Trans.lift(monadTransReaderT)(dictMonadState["__superclass_Control.Monad.Monad_0"]())(Control_Monad_State_Class.state(dictMonadState)($58));
    });
};
var monadWriterReaderT = function (dictMonadWriter) {
    return new Control_Monad_Writer_Class.MonadWriter(function () {
        return monadReaderT(dictMonadWriter["__superclass_Control.Monad.Monad_0"]());
    }, mapReaderT(Control_Monad_Writer_Class.listen(dictMonadWriter)), mapReaderT(Control_Monad_Writer_Class.pass(dictMonadWriter)), function ($59) {
        return Control_Monad_Trans.lift(monadTransReaderT)(dictMonadWriter["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Writer_Class.writer(dictMonadWriter)($59));
    });
};
var altReaderT = function (dictAlt) {
    return new Control_Alt.Alt(function () {
        return functorReaderT(dictAlt["__superclass_Data.Functor.Functor_0"]());
    }, function (v) {
        return function (v1) {
            return function (r) {
                return Control_Alt.alt(dictAlt)(v(r))(v1(r));
            };
        };
    });
};
var plusReaderT = function (dictPlus) {
    return new Control_Plus.Plus(function () {
        return altReaderT(dictPlus["__superclass_Control.Alt.Alt_0"]());
    }, Data_Function["const"](Control_Plus.empty(dictPlus)));
};
var alternativeReaderT = function (dictAlternative) {
    return new Control_Alternative.Alternative(function () {
        return applicativeReaderT(dictAlternative["__superclass_Control.Applicative.Applicative_0"]());
    }, function () {
        return plusReaderT(dictAlternative["__superclass_Control.Plus.Plus_1"]());
    });
};
var monadZeroReaderT = function (dictMonadZero) {
    return new Control_MonadZero.MonadZero(function () {
        return alternativeReaderT(dictMonadZero["__superclass_Control.Alternative.Alternative_1"]());
    }, function () {
        return monadReaderT(dictMonadZero["__superclass_Control.Monad.Monad_0"]());
    });
};
var monadPlusReaderT = function (dictMonadPlus) {
    return new Control_MonadPlus.MonadPlus(function () {
        return monadZeroReaderT(dictMonadPlus["__superclass_Control.MonadZero.MonadZero_0"]());
    });
};
module.exports = {
    ReaderT: ReaderT, 
    mapReaderT: mapReaderT, 
    runReaderT: runReaderT, 
    withReaderT: withReaderT, 
    functorReaderT: functorReaderT, 
    applyReaderT: applyReaderT, 
    applicativeReaderT: applicativeReaderT, 
    altReaderT: altReaderT, 
    plusReaderT: plusReaderT, 
    alternativeReaderT: alternativeReaderT, 
    bindReaderT: bindReaderT, 
    monadReaderT: monadReaderT, 
    monadZeroReaderT: monadZeroReaderT, 
    monadPlusReaderT: monadPlusReaderT, 
    monadTransReaderT: monadTransReaderT, 
    monadEffReader: monadEffReader, 
    monadContReaderT: monadContReaderT, 
    monadErrorReaderT: monadErrorReaderT, 
    monadReaderReaderT: monadReaderReaderT, 
    monadStateReaderT: monadStateReaderT, 
    monadWriterReaderT: monadWriterReaderT, 
    distributiveReaderT: distributiveReaderT, 
    monadRecReaderT: monadRecReaderT
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.Monad.Cont.Class":31,"../Control.Monad.Eff.Class":33,"../Control.Monad.Error.Class":48,"../Control.Monad.Reader.Class":52,"../Control.Monad.Rec.Class":54,"../Control.Monad.State.Class":57,"../Control.Monad.Trans":58,"../Control.Monad.Writer.Class":59,"../Control.MonadPlus":62,"../Control.MonadZero":63,"../Control.Plus":65,"../Control.Semigroupoid":66,"../Data.Distributive":78,"../Data.Either":79,"../Data.Function":91,"../Data.Functor":94,"../Prelude":144}],54:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Unsafe = require("../Control.Monad.Eff.Unsafe");
var Control_Monad_ST = require("../Control.Monad.ST");
var Data_Either = require("../Data.Either");
var Data_Identity = require("../Data.Identity");
var Partial_Unsafe = require("../Partial.Unsafe");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Bind = require("../Control.Bind");
var Control_Applicative = require("../Control.Applicative");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var MonadRec = function (__superclass_Control$dotMonad$dotMonad_0, tailRecM) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.tailRecM = tailRecM;
};
var tailRecM = function (dict) {
    return dict.tailRecM;
};
var tailRecM2 = function (dictMonadRec) {
    return function (f) {
        return function (a) {
            return function (b) {
                return tailRecM(dictMonadRec)(function (o) {
                    return f(o.a)(o.b);
                })({
                    a: a, 
                    b: b
                });
            };
        };
    };
};
var tailRecM3 = function (dictMonadRec) {
    return function (f) {
        return function (a) {
            return function (b) {
                return function (c) {
                    return tailRecM(dictMonadRec)(function (o) {
                        return f(o.a)(o.b)(o.c);
                    })({
                        a: a, 
                        b: b, 
                        c: c
                    });
                };
            };
        };
    };
};
var tailRecEff = function (f) {
    return function (a) {
        var f$prime = function ($26) {
            return Control_Monad_Eff_Unsafe.unsafeInterleaveEff(f($26));
        };
        return function __do() {
            var v = f$prime(a)();
            var v1 = {
                value: v
            };
            (function () {
                while (!(function __do() {
                    var v2 = v1.value;
                    if (v2 instanceof Data_Either.Left) {
                        var v3 = f$prime(v2.value0)();
                        v1.value = v3;
                        return false;
                    };
                    if (v2 instanceof Data_Either.Right) {
                        return true;
                    };
                    throw new Error("Failed pattern match at Control.Monad.Rec.Class line 103, column 5 - line 108, column 27: " + [ v2.constructor.name ]);
                })()) {

                };
                return {};
            })();
            return Data_Function.apply(Partial_Unsafe.unsafePartial)(function (dictPartial) {
                return Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Either.fromRight(dictPartial))(Control_Monad_ST.readSTRef(v1));
            })();
        };
    };
};
var tailRec = function (f) {
    return function (a) {
        var go = function (__copy_v) {
            var v = __copy_v;
            tco: while (true) {
                if (v instanceof Data_Either.Left) {
                    var __tco_v = f(v.value0);
                    v = __tco_v;
                    continue tco;
                };
                if (v instanceof Data_Either.Right) {
                    return v.value0;
                };
                throw new Error("Failed pattern match at Control.Monad.Rec.Class line 78, column 1 - line 81, column 19: " + [ v.constructor.name ]);
            };
        };
        return go(f(a));
    };
};
var monadRecIdentity = new MonadRec(function () {
    return Data_Identity.monadIdentity;
}, function (f) {
    return function ($27) {
        return Data_Identity.Identity(tailRec(function ($28) {
            return Data_Identity.runIdentity(f($28));
        })($27));
    };
});
var monadRecEither = new MonadRec(function () {
    return Data_Either.monadEither;
}, function (f) {
    return function (a0) {
        var g = function (v) {
            if (v instanceof Data_Either.Left) {
                return new Data_Either.Right(new Data_Either.Left(v.value0));
            };
            if (v instanceof Data_Either.Right && v.value0 instanceof Data_Either.Left) {
                return new Data_Either.Left(f(v.value0.value0));
            };
            if (v instanceof Data_Either.Right && v.value0 instanceof Data_Either.Right) {
                return new Data_Either.Right(new Data_Either.Right(v.value0.value0));
            };
            throw new Error("Failed pattern match at Control.Monad.Rec.Class line 92, column 7 - line 92, column 34: " + [ v.constructor.name ]);
        };
        return tailRec(g)(f(a0));
    };
});
var monadRecEff = new MonadRec(function () {
    return Control_Monad_Eff.monadEff;
}, tailRecEff);
var forever = function (dictMonadRec) {
    return function (ma) {
        return tailRecM(dictMonadRec)(function (u) {
            return Data_Functor.voidRight((((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(new Data_Either.Left(u))(ma);
        })(Data_Unit.unit);
    };
};
module.exports = {
    MonadRec: MonadRec, 
    forever: forever, 
    tailRec: tailRec, 
    tailRecM: tailRecM, 
    tailRecM2: tailRecM2, 
    tailRecM3: tailRecM3, 
    monadRecIdentity: monadRecIdentity, 
    monadRecEff: monadRecEff, 
    monadRecEither: monadRecEither
};

},{"../Control.Applicative":14,"../Control.Bind":20,"../Control.Monad.Eff":47,"../Control.Monad.Eff.Unsafe":45,"../Control.Monad.ST":56,"../Control.Semigroupoid":66,"../Data.Either":79,"../Data.Function":91,"../Data.Functor":94,"../Data.Identity":97,"../Data.Unit":135,"../Partial.Unsafe":141,"../Prelude":144}],55:[function(require,module,exports){
/* global exports */
"use strict";

// module Control.Monad.ST

exports.newSTRef = function (val) {
  return function () {
    return { value: val };
  };
};

exports.readSTRef = function (ref) {
  return function () {
    return ref.value;
  };
};

exports.modifySTRef = function (ref) {
  return function (f) {
    return function () {
      /* jshint boss: true */
      return ref.value = f(ref.value);
    };
  };
};

exports.writeSTRef = function (ref) {
  return function (a) {
    return function () {
      /* jshint boss: true */
      return ref.value = a;
    };
  };
};

exports.runST = function (f) {
  return f;
};

},{}],56:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var pureST = function (st) {
    return Control_Monad_Eff.runPure($foreign.runST(st));
};
module.exports = {
    pureST: pureST, 
    modifySTRef: $foreign.modifySTRef, 
    newSTRef: $foreign.newSTRef, 
    readSTRef: $foreign.readSTRef, 
    runST: $foreign.runST, 
    writeSTRef: $foreign.writeSTRef
};

},{"../Control.Monad.Eff":47,"./foreign":55}],57:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var Data_Tuple = require("../Data.Tuple");
var Data_Unit = require("../Data.Unit");
var MonadState = function (__superclass_Control$dotMonad$dotMonad_0, state) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.state = state;
};
var state = function (dict) {
    return dict.state;
};
var put = function (dictMonadState) {
    return function (s) {
        return state(dictMonadState)(function (v) {
            return new Data_Tuple.Tuple(Data_Unit.unit, s);
        });
    };
};
var modify = function (dictMonadState) {
    return function (f) {
        return state(dictMonadState)(function (s) {
            return new Data_Tuple.Tuple(Data_Unit.unit, f(s));
        });
    };
};
var gets = function (dictMonadState) {
    return function (f) {
        return state(dictMonadState)(function (s) {
            return new Data_Tuple.Tuple(f(s), s);
        });
    };
};
var get = function (dictMonadState) {
    return state(dictMonadState)(function (s) {
        return new Data_Tuple.Tuple(s, s);
    });
};
module.exports = {
    MonadState: MonadState, 
    get: get, 
    gets: gets, 
    modify: modify, 
    put: put, 
    state: state
};

},{"../Data.Tuple":133,"../Data.Unit":135,"../Prelude":144}],58:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var MonadTrans = function (lift) {
    this.lift = lift;
};
var lift = function (dict) {
    return dict.lift;
};
module.exports = {
    MonadTrans: MonadTrans, 
    lift: lift
};

},{"../Prelude":144}],59:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var Data_Tuple = require("../Data.Tuple");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Unit = require("../Data.Unit");
var Control_Bind = require("../Control.Bind");
var Data_Function = require("../Data.Function");
var Control_Applicative = require("../Control.Applicative");
var MonadWriter = function (__superclass_Control$dotMonad$dotMonad_0, listen, pass, writer) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.listen = listen;
    this.pass = pass;
    this.writer = writer;
};
var writer = function (dict) {
    return dict.writer;
};
var tell = function (dictMonadWriter) {
    return function ($9) {
        return writer(dictMonadWriter)(Data_Tuple.Tuple.create(Data_Unit.unit)($9));
    };
};
var pass = function (dict) {
    return dict.pass;
};
var listen = function (dict) {
    return dict.listen;
};
var listens = function (dictMonadWriter) {
    return function (f) {
        return function (m) {
            return Control_Bind.bind((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(listen(dictMonadWriter)(m))(function (v) {
                return Data_Function.apply(Control_Applicative.pure((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]()))(new Data_Tuple.Tuple(v.value0, f(v.value1)));
            });
        };
    };
};
var censor = function (dictMonadWriter) {
    return function (f) {
        return function (m) {
            return pass(dictMonadWriter)(Control_Bind.bind((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())(m)(function (v) {
                return Data_Function.apply(Control_Applicative.pure((dictMonadWriter["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]()))(new Data_Tuple.Tuple(v, f));
            }));
        };
    };
};
module.exports = {
    MonadWriter: MonadWriter, 
    censor: censor, 
    listen: listen, 
    listens: listens, 
    pass: pass, 
    tell: tell, 
    writer: writer
};

},{"../Control.Applicative":14,"../Control.Bind":20,"../Control.Semigroupoid":66,"../Data.Function":91,"../Data.Tuple":133,"../Data.Unit":135,"../Prelude":144}],60:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var Data_Either = require("../Data.Either");
var Data_Monoid = require("../Data.Monoid");
var Data_Tuple = require("../Data.Tuple");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Monad_Cont_Class = require("../Control.Monad.Cont.Class");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Error_Class = require("../Control.Monad.Error.Class");
var Control_Monad_Reader_Class = require("../Control.Monad.Reader.Class");
var Control_Monad_Rec_Class = require("../Control.Monad.Rec.Class");
var Control_Monad_State_Class = require("../Control.Monad.State.Class");
var Control_Monad_Trans = require("../Control.Monad.Trans");
var Control_Monad_Writer_Class = require("../Control.Monad.Writer.Class");
var Control_MonadPlus = require("../Control.MonadPlus");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Functor = require("../Data.Functor");
var Data_Function = require("../Data.Function");
var Control_Apply = require("../Control.Apply");
var Data_Semigroup = require("../Data.Semigroup");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var WriterT = function (x) {
    return x;
};
var runWriterT = function (v) {
    return v;
};
var monadTransWriterT = function (dictMonoid) {
    return new Control_Monad_Trans.MonadTrans(function (dictMonad) {
        return function (m) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(m)(function (v) {
                return Data_Function.apply(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]()))(new Data_Tuple.Tuple(v, Data_Monoid.mempty(dictMonoid)));
            });
        };
    });
};
var mapWriterT = function (f) {
    return function (v) {
        return f(v);
    };
};
var functorWriterT = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return Data_Function.apply(mapWriterT)(Data_Functor.map(dictFunctor)(function (v) {
            return new Data_Tuple.Tuple(f(v.value0), v.value1);
        }));
    });
};
var execWriterT = function (dictFunctor) {
    return function (v) {
        return Data_Functor.map(dictFunctor)(Data_Tuple.snd)(v);
    };
};
var applyWriterT = function (dictSemigroup) {
    return function (dictApply) {
        return new Control_Apply.Apply(function () {
            return functorWriterT(dictApply["__superclass_Data.Functor.Functor_0"]());
        }, function (v) {
            return function (v1) {
                var k = function (v3) {
                    return function (v4) {
                        return new Data_Tuple.Tuple(v3.value0(v4.value0), Data_Semigroup.append(dictSemigroup)(v3.value1)(v4.value1));
                    };
                };
                return Control_Apply.apply(dictApply)(Data_Functor.map(dictApply["__superclass_Data.Functor.Functor_0"]())(k)(v))(v1);
            };
        });
    };
};
var bindWriterT = function (dictSemigroup) {
    return function (dictMonad) {
        return new Control_Bind.Bind(function () {
            return applyWriterT(dictSemigroup)((dictMonad["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]());
        }, function (v) {
            return function (k) {
                return Data_Function.apply(WriterT)(Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v1) {
                    return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())((function () {
                        var $74 = k(v1.value0);
                        return $74;
                    })())(function (v2) {
                        return Data_Function.apply(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]()))(new Data_Tuple.Tuple(v2.value0, Data_Semigroup.append(dictSemigroup)(v1.value1)(v2.value1)));
                    });
                }));
            };
        });
    };
};
var applicativeWriterT = function (dictMonoid) {
    return function (dictApplicative) {
        return new Control_Applicative.Applicative(function () {
            return applyWriterT(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(dictApplicative["__superclass_Control.Apply.Apply_0"]());
        }, function (a) {
            return Data_Function.apply(WriterT)(Data_Function.apply(Control_Applicative.pure(dictApplicative))(new Data_Tuple.Tuple(a, Data_Monoid.mempty(dictMonoid))));
        });
    };
};
var monadWriterT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Monad.Monad(function () {
            return applicativeWriterT(dictMonoid)(dictMonad["__superclass_Control.Applicative.Applicative_0"]());
        }, function () {
            return bindWriterT(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(dictMonad);
        });
    };
};
var monadContWriterT = function (dictMonoid) {
    return function (dictMonadCont) {
        return new Control_Monad_Cont_Class.MonadCont(function () {
            return monadWriterT(dictMonoid)(dictMonadCont["__superclass_Control.Monad.Monad_0"]());
        }, function (f) {
            return Data_Function.apply(WriterT)(Control_Monad_Cont_Class.callCC(dictMonadCont)(function (c) {
                var $80 = f(function (a) {
                    return Data_Function.apply(WriterT)(c(new Data_Tuple.Tuple(a, Data_Monoid.mempty(dictMonoid))));
                });
                return $80;
            }));
        });
    };
};
var monadEffWriter = function (dictMonoid) {
    return function (dictMonadEff) {
        return new Control_Monad_Eff_Class.MonadEff(function () {
            return monadWriterT(dictMonoid)(dictMonadEff["__superclass_Control.Monad.Monad_0"]());
        }, function ($106) {
            return Control_Monad_Trans.lift(monadTransWriterT(dictMonoid))(dictMonadEff["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Eff_Class.liftEff(dictMonadEff)($106));
        });
    };
};
var monadErrorWriterT = function (dictMonoid) {
    return function (dictMonadError) {
        return new Control_Monad_Error_Class.MonadError(function () {
            return monadWriterT(dictMonoid)(dictMonadError["__superclass_Control.Monad.Monad_0"]());
        }, function (v) {
            return function (h) {
                return Data_Function.apply(WriterT)(Control_Monad_Error_Class.catchError(dictMonadError)(v)(function (e) {
                    var $83 = h(e);
                    return $83;
                }));
            };
        }, function (e) {
            return Control_Monad_Trans.lift(monadTransWriterT(dictMonoid))(dictMonadError["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Error_Class.throwError(dictMonadError)(e));
        });
    };
};
var monadReaderWriterT = function (dictMonoid) {
    return function (dictMonadReader) {
        return new Control_Monad_Reader_Class.MonadReader(function () {
            return monadWriterT(dictMonoid)(dictMonadReader["__superclass_Control.Monad.Monad_0"]());
        }, Control_Monad_Trans.lift(monadTransWriterT(dictMonoid))(dictMonadReader["__superclass_Control.Monad.Monad_0"]())(Control_Monad_Reader_Class.ask(dictMonadReader)), function (f) {
            return mapWriterT(Control_Monad_Reader_Class.local(dictMonadReader)(f));
        });
    };
};
var monadRecWriterT = function (dictMonoid) {
    return function (dictMonadRec) {
        return new Control_Monad_Rec_Class.MonadRec(function () {
            return monadWriterT(dictMonoid)(dictMonadRec["__superclass_Control.Monad.Monad_0"]());
        }, function (f) {
            return function (a) {
                var f$prime = function (v) {
                    return Control_Bind.bind((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())((function () {
                        var $85 = f(v.value0);
                        return $85;
                    })())(function (v1) {
                        return Control_Applicative.pure((dictMonadRec["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())((function () {
                            if (v1.value0 instanceof Data_Either.Left) {
                                return new Data_Either.Left(new Data_Tuple.Tuple(v1.value0.value0, Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(v.value1)(v1.value1)));
                            };
                            if (v1.value0 instanceof Data_Either.Right) {
                                return new Data_Either.Right(new Data_Tuple.Tuple(v1.value0.value0, Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(v.value1)(v1.value1)));
                            };
                            throw new Error("Failed pattern match at Control.Monad.Writer.Trans line 83, column 11 - line 85, column 49: " + [ v1.value0.constructor.name ]);
                        })());
                    });
                };
                return Data_Function.apply(WriterT)(Control_Monad_Rec_Class.tailRecM(dictMonadRec)(f$prime)(new Data_Tuple.Tuple(a, Data_Monoid.mempty(dictMonoid))));
            };
        });
    };
};
var monadStateWriterT = function (dictMonoid) {
    return function (dictMonadState) {
        return new Control_Monad_State_Class.MonadState(function () {
            return monadWriterT(dictMonoid)(dictMonadState["__superclass_Control.Monad.Monad_0"]());
        }, function (f) {
            return Control_Monad_Trans.lift(monadTransWriterT(dictMonoid))(dictMonadState["__superclass_Control.Monad.Monad_0"]())(Control_Monad_State_Class.state(dictMonadState)(f));
        });
    };
};
var monadWriterWriterT = function (dictMonoid) {
    return function (dictMonad) {
        return new Control_Monad_Writer_Class.MonadWriter(function () {
            return monadWriterT(dictMonoid)(dictMonad);
        }, function (v) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v1) {
                return Data_Function.apply(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]()))(new Data_Tuple.Tuple(new Data_Tuple.Tuple(v1.value0, v1.value1), v1.value1));
            });
        }, function (v) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(v)(function (v1) {
                return Data_Function.apply(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]()))(new Data_Tuple.Tuple(v1.value0.value0, v1.value0.value1(v1.value1)));
            });
        }, function ($107) {
            return WriterT(Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())($107));
        });
    };
};
var altWriterT = function (dictAlt) {
    return new Control_Alt.Alt(function () {
        return functorWriterT(dictAlt["__superclass_Data.Functor.Functor_0"]());
    }, function (v) {
        return function (v1) {
            return Control_Alt.alt(dictAlt)(v)(v1);
        };
    });
};
var plusWriterT = function (dictPlus) {
    return new Control_Plus.Plus(function () {
        return altWriterT(dictPlus["__superclass_Control.Alt.Alt_0"]());
    }, Control_Plus.empty(dictPlus));
};
var alternativeWriterT = function (dictMonoid) {
    return function (dictAlternative) {
        return new Control_Alternative.Alternative(function () {
            return applicativeWriterT(dictMonoid)(dictAlternative["__superclass_Control.Applicative.Applicative_0"]());
        }, function () {
            return plusWriterT(dictAlternative["__superclass_Control.Plus.Plus_1"]());
        });
    };
};
var monadZeroWriterT = function (dictMonoid) {
    return function (dictMonadZero) {
        return new Control_MonadZero.MonadZero(function () {
            return alternativeWriterT(dictMonoid)(dictMonadZero["__superclass_Control.Alternative.Alternative_1"]());
        }, function () {
            return monadWriterT(dictMonoid)(dictMonadZero["__superclass_Control.Monad.Monad_0"]());
        });
    };
};
var monadPlusWriterT = function (dictMonoid) {
    return function (dictMonadPlus) {
        return new Control_MonadPlus.MonadPlus(function () {
            return monadZeroWriterT(dictMonoid)(dictMonadPlus["__superclass_Control.MonadZero.MonadZero_0"]());
        });
    };
};
module.exports = {
    WriterT: WriterT, 
    execWriterT: execWriterT, 
    mapWriterT: mapWriterT, 
    runWriterT: runWriterT, 
    functorWriterT: functorWriterT, 
    applyWriterT: applyWriterT, 
    applicativeWriterT: applicativeWriterT, 
    altWriterT: altWriterT, 
    plusWriterT: plusWriterT, 
    alternativeWriterT: alternativeWriterT, 
    bindWriterT: bindWriterT, 
    monadWriterT: monadWriterT, 
    monadRecWriterT: monadRecWriterT, 
    monadZeroWriterT: monadZeroWriterT, 
    monadPlusWriterT: monadPlusWriterT, 
    monadTransWriterT: monadTransWriterT, 
    monadEffWriter: monadEffWriter, 
    monadContWriterT: monadContWriterT, 
    monadErrorWriterT: monadErrorWriterT, 
    monadReaderWriterT: monadReaderWriterT, 
    monadStateWriterT: monadStateWriterT, 
    monadWriterWriterT: monadWriterWriterT
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.Monad.Cont.Class":31,"../Control.Monad.Eff.Class":33,"../Control.Monad.Error.Class":48,"../Control.Monad.Reader.Class":52,"../Control.Monad.Rec.Class":54,"../Control.Monad.State.Class":57,"../Control.Monad.Trans":58,"../Control.Monad.Writer.Class":59,"../Control.MonadPlus":62,"../Control.MonadZero":63,"../Control.Plus":65,"../Control.Semigroupoid":66,"../Data.Either":79,"../Data.Function":91,"../Data.Functor":94,"../Data.Monoid":111,"../Data.Semigroup":121,"../Data.Tuple":133,"../Prelude":144}],61:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Data_Functor = require("../Data.Functor");
var Monad = function (__superclass_Control$dotApplicative$dotApplicative_0, __superclass_Control$dotBind$dotBind_1) {
    this["__superclass_Control.Applicative.Applicative_0"] = __superclass_Control$dotApplicative$dotApplicative_0;
    this["__superclass_Control.Bind.Bind_1"] = __superclass_Control$dotBind$dotBind_1;
};
var monadFn = new Monad(function () {
    return Control_Applicative.applicativeFn;
}, function () {
    return Control_Bind.bindFn;
});
var monadArray = new Monad(function () {
    return Control_Applicative.applicativeArray;
}, function () {
    return Control_Bind.bindArray;
});
var liftM1 = function (dictMonad) {
    return function (f) {
        return function (a) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(a)(function (v) {
                return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(f(v));
            });
        };
    };
};
var ap = function (dictMonad) {
    return function (f) {
        return function (a) {
            return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(f)(function (v) {
                return Control_Bind.bind(dictMonad["__superclass_Control.Bind.Bind_1"]())(a)(function (v1) {
                    return Control_Applicative.pure(dictMonad["__superclass_Control.Applicative.Applicative_0"]())(v(v1));
                });
            });
        };
    };
};
module.exports = {
    Monad: Monad, 
    ap: ap, 
    liftM1: liftM1, 
    monadFn: monadFn, 
    monadArray: monadArray
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Data.Functor":94}],62:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Functor = require("../Data.Functor");
var MonadPlus = function (__superclass_Control$dotMonadZero$dotMonadZero_0) {
    this["__superclass_Control.MonadZero.MonadZero_0"] = __superclass_Control$dotMonadZero$dotMonadZero_0;
};
var monadPlusArray = new MonadPlus(function () {
    return Control_MonadZero.monadZeroArray;
});
module.exports = {
    MonadPlus: MonadPlus, 
    monadPlusArray: monadPlusArray
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.MonadZero":63,"../Control.Plus":65,"../Data.Functor":94}],63:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Control_Plus = require("../Control.Plus");
var Data_Functor = require("../Data.Functor");
var Data_Unit = require("../Data.Unit");
var MonadZero = function (__superclass_Control$dotAlternative$dotAlternative_1, __superclass_Control$dotMonad$dotMonad_0) {
    this["__superclass_Control.Alternative.Alternative_1"] = __superclass_Control$dotAlternative$dotAlternative_1;
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
};
var monadZeroArray = new MonadZero(function () {
    return Control_Alternative.alternativeArray;
}, function () {
    return Control_Monad.monadArray;
});
var guard = function (dictMonadZero) {
    return function (v) {
        if (v) {
            return Control_Applicative.pure((dictMonadZero["__superclass_Control.Alternative.Alternative_1"]())["__superclass_Control.Applicative.Applicative_0"]())(Data_Unit.unit);
        };
        if (!v) {
            return Control_Plus.empty((dictMonadZero["__superclass_Control.Alternative.Alternative_1"]())["__superclass_Control.Plus.Plus_1"]());
        };
        throw new Error("Failed pattern match at Control.MonadZero line 52, column 1 - line 52, column 23: " + [ v.constructor.name ]);
    };
};
module.exports = {
    MonadZero: MonadZero, 
    guard: guard, 
    monadZeroArray: monadZeroArray
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad":61,"../Control.Plus":65,"../Data.Functor":94,"../Data.Unit":135}],64:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Apply = require("../Control.Apply");
var Control_Monad_Cont_Trans = require("../Control.Monad.Cont.Trans");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Ref = require("../Control.Monad.Eff.Ref");
var Control_Monad_Eff_Unsafe = require("../Control.Monad.Eff.Unsafe");
var Control_Monad_Except_Trans = require("../Control.Monad.Except.Trans");
var Control_Monad_Reader_Trans = require("../Control.Monad.Reader.Trans");
var Control_Monad_Maybe_Trans = require("../Control.Monad.Maybe.Trans");
var Control_Monad_Writer_Trans = require("../Control.Monad.Writer.Trans");
var Control_Plus = require("../Control.Plus");
var Data_Foldable = require("../Data.Foldable");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Traversable = require("../Data.Traversable");
var Data_Tuple = require("../Data.Tuple");
var Control_Bind = require("../Control.Bind");
var Data_Function = require("../Data.Function");
var Data_Semigroup = require("../Data.Semigroup");
var Control_Applicative = require("../Control.Applicative");
var Data_Unit = require("../Data.Unit");
var Data_Functor = require("../Data.Functor");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Either = require("../Data.Either");
var Parallel = function (x) {
    return x;
};
var MonadPar = function (__superclass_Control$dotMonad$dotMonad_0, par) {
    this["__superclass_Control.Monad.Monad_0"] = __superclass_Control$dotMonad$dotMonad_0;
    this.par = par;
};
var MonadRace = function (__superclass_Control$dotParallel$dotClass$dotMonadPar_0, race, stall) {
    this["__superclass_Control.Parallel.Class.MonadPar_0"] = __superclass_Control$dotParallel$dotClass$dotMonadPar_0;
    this.race = race;
    this.stall = stall;
};
var unsafeWithRef = Control_Monad_Eff_Unsafe.unsafeInterleaveEff;
var stall = function (dict) {
    return dict.stall;
};
var runParallel = function (v) {
    return v;
};
var race = function (dict) {
    return dict.race;
};
var parallel = Parallel;
var par = function (dict) {
    return dict.par;
};
var monadParWriterT = function (dictMonoid) {
    return function (dictMonadPar) {
        return new MonadPar(function () {
            return Control_Monad_Writer_Trans.monadWriterT(dictMonoid)(dictMonadPar["__superclass_Control.Monad.Monad_0"]());
        }, function (f) {
            return function (v) {
                return function (v1) {
                    return Data_Function.apply(Control_Monad_Writer_Trans.WriterT)(par(dictMonadPar)(function (v2) {
                        return function (v3) {
                            return new Data_Tuple.Tuple(f(v2.value0)(v3.value0), Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(v2.value1)(v3.value1));
                        };
                    })(v)(v1));
                };
            };
        });
    };
};
var monadRaceWriterT = function (dictMonoid) {
    return function (dictMonadRace) {
        return new MonadRace(function () {
            return monadParWriterT(dictMonoid)(dictMonadRace["__superclass_Control.Parallel.Class.MonadPar_0"]());
        }, function (v) {
            return function (v1) {
                return race(dictMonadRace)(v)(v1);
            };
        }, stall(dictMonadRace));
    };
};
var monadParReaderT = function (dictMonadPar) {
    return new MonadPar(function () {
        return Control_Monad_Reader_Trans.monadReaderT(dictMonadPar["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return function (v) {
            return function (v1) {
                return function (r) {
                    return par(dictMonadPar)(f)(v(r))(v1(r));
                };
            };
        };
    });
};
var monadRaceReaderT = function (dictMonadRace) {
    return new MonadRace(function () {
        return monadParReaderT(dictMonadRace["__superclass_Control.Parallel.Class.MonadPar_0"]());
    }, function (v) {
        return function (v1) {
            return function (r) {
                return race(dictMonadRace)(v(r))(v1(r));
            };
        };
    }, function (v) {
        return stall(dictMonadRace);
    });
};
var monadParMaybeT = function (dictMonadPar) {
    return new MonadPar(function () {
        return Control_Monad_Maybe_Trans.monadMaybeT(dictMonadPar["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return function (v) {
            return function (v1) {
                return par(dictMonadPar)(Control_Apply.lift2(Data_Maybe.applyMaybe)(f))(v)(v1);
            };
        };
    });
};
var monadRaceMaybeT = function (dictMonadRace) {
    return new MonadRace(function () {
        return monadParMaybeT(dictMonadRace["__superclass_Control.Parallel.Class.MonadPar_0"]());
    }, function (v) {
        return function (v1) {
            return race(dictMonadRace)(v)(v1);
        };
    }, stall(dictMonadRace));
};
var monadParExceptT = function (dictMonadPar) {
    return new MonadPar(function () {
        return Control_Monad_Except_Trans.monadExceptT(dictMonadPar["__superclass_Control.Monad.Monad_0"]());
    }, function (f) {
        return function (v) {
            return function (v1) {
                return par(dictMonadPar)(Control_Apply.lift2(Data_Either.applyEither)(f))(v)(v1);
            };
        };
    });
};
var monadRaceExceptT = function (dictMonadRace) {
    return new MonadRace(function () {
        return monadParExceptT(dictMonadRace["__superclass_Control.Parallel.Class.MonadPar_0"]());
    }, function (v) {
        return function (v1) {
            return race(dictMonadRace)(v)(v1);
        };
    }, stall(dictMonadRace));
};
var monadParContT = new MonadPar(function () {
    return Control_Monad_Cont_Trans.monadContT(Control_Monad_Eff.monadEff);
}, function (f) {
    return function (ca) {
        return function (cb) {
            return function (k) {
                return function __do() {
                    var v = unsafeWithRef(Control_Monad_Eff_Ref.newRef(Data_Maybe.Nothing.value))();
                    var v1 = unsafeWithRef(Control_Monad_Eff_Ref.newRef(Data_Maybe.Nothing.value))();
                    Control_Monad_Cont_Trans.runContT(ca)(function (a) {
                        return function __do() {
                            var v2 = unsafeWithRef(Control_Monad_Eff_Ref.readRef(v1))();
                            if (v2 instanceof Data_Maybe.Nothing) {
                                return unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v)(new Data_Maybe.Just(a)))();
                            };
                            if (v2 instanceof Data_Maybe.Just) {
                                return k(f(a)(v2.value0))();
                            };
                            throw new Error("Failed pattern match at Control.Parallel.Class line 51, column 7 - line 53, column 28: " + [ v2.constructor.name ]);
                        };
                    })();
                    return Control_Monad_Cont_Trans.runContT(cb)(function (b) {
                        return function __do() {
                            var v2 = unsafeWithRef(Control_Monad_Eff_Ref.readRef(v))();
                            if (v2 instanceof Data_Maybe.Nothing) {
                                return unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v1)(new Data_Maybe.Just(b)))();
                            };
                            if (v2 instanceof Data_Maybe.Just) {
                                return k(f(v2.value0)(b))();
                            };
                            throw new Error("Failed pattern match at Control.Parallel.Class line 57, column 7 - line 59, column 28: " + [ v2.constructor.name ]);
                        };
                    })();
                };
            };
        };
    };
});
var monadRaceContT = new MonadRace(function () {
    return monadParContT;
}, function (c1) {
    return function (c2) {
        return function (k) {
            return function __do() {
                var v = unsafeWithRef(Control_Monad_Eff_Ref.newRef(false))();
                Control_Monad_Cont_Trans.runContT(c1)(function (a) {
                    return function __do() {
                        var v1 = unsafeWithRef(Control_Monad_Eff_Ref.readRef(v))();
                        if (v1) {
                            return Data_Unit.unit;
                        };
                        if (!v1) {
                            unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v)(true))();
                            return k(a)();
                        };
                        throw new Error("Failed pattern match at Control.Parallel.Class line 111, column 7 - line 115, column 14: " + [ v1.constructor.name ]);
                    };
                })();
                return Control_Monad_Cont_Trans.runContT(c2)(function (a) {
                    return function __do() {
                        var v1 = unsafeWithRef(Control_Monad_Eff_Ref.readRef(v))();
                        if (v1) {
                            return Data_Unit.unit;
                        };
                        if (!v1) {
                            unsafeWithRef(Control_Monad_Eff_Ref.writeRef(v)(true))();
                            return k(a)();
                        };
                        throw new Error("Failed pattern match at Control.Parallel.Class line 119, column 7 - line 123, column 14: " + [ v1.constructor.name ]);
                    };
                })();
            };
        };
    };
}, function (v) {
    return Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit);
});
var functorParallel = function (dictFunctor) {
    return new Data_Functor.Functor(function (f) {
        return function ($90) {
            return parallel(Data_Functor.map(dictFunctor)(f)(runParallel($90)));
        };
    });
};
var applyParallel = function (dictMonadPar) {
    return new Control_Apply.Apply(function () {
        return functorParallel((((dictMonadPar["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]());
    }, function (f) {
        return function (a) {
            return parallel(par(dictMonadPar)(Data_Function.apply)(runParallel(f))(runParallel(a)));
        };
    });
};
var applicativeParallel = function (dictMonadPar) {
    return new Control_Applicative.Applicative(function () {
        return applyParallel(dictMonadPar);
    }, function ($91) {
        return parallel(Control_Applicative.pure((dictMonadPar["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Applicative.Applicative_0"]())($91));
    });
};
var parTraverse = function (dictMonadPar) {
    return function (dictTraversable) {
        return function (f) {
            return function ($92) {
                return runParallel(Data_Traversable.traverse(dictTraversable)(applicativeParallel(dictMonadPar))(function ($93) {
                    return Parallel(f($93));
                })($92));
            };
        };
    };
};
var parTraverse_ = function (dictMonadPar) {
    return function (dictFoldable) {
        return function (f) {
            return function ($94) {
                return runParallel(Data_Foldable.traverse_(applicativeParallel(dictMonadPar))(dictFoldable)(function ($95) {
                    return Parallel(f($95));
                })($94));
            };
        };
    };
};
var altParallel = function (dictMonadRace) {
    return new Control_Alt.Alt(function () {
        return functorParallel(((((dictMonadRace["__superclass_Control.Parallel.Class.MonadPar_0"]())["__superclass_Control.Monad.Monad_0"]())["__superclass_Control.Bind.Bind_1"]())["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]());
    }, function (a) {
        return function (b) {
            return parallel(race(dictMonadRace)(runParallel(a))(runParallel(b)));
        };
    });
};
var plusParallel = function (dictMonadRace) {
    return new Control_Plus.Plus(function () {
        return altParallel(dictMonadRace);
    }, parallel(stall(dictMonadRace)));
};
var alternativeParallel = function (dictMonadRace) {
    return new Control_Alternative.Alternative(function () {
        return applicativeParallel(dictMonadRace["__superclass_Control.Parallel.Class.MonadPar_0"]());
    }, function () {
        return plusParallel(dictMonadRace);
    });
};
module.exports = {
    MonadPar: MonadPar, 
    MonadRace: MonadRace, 
    par: par, 
    parTraverse: parTraverse, 
    parTraverse_: parTraverse_, 
    parallel: parallel, 
    race: race, 
    runParallel: runParallel, 
    stall: stall, 
    monadParContT: monadParContT, 
    monadParExceptT: monadParExceptT, 
    monadParMaybeT: monadParMaybeT, 
    monadParReaderT: monadParReaderT, 
    monadParWriterT: monadParWriterT, 
    monadRaceContT: monadRaceContT, 
    monadRaceExceptT: monadRaceExceptT, 
    monadRaceMaybeT: monadRaceMaybeT, 
    monadRaceReaderT: monadRaceReaderT, 
    monadRaceWriterT: monadRaceWriterT, 
    functorParallel: functorParallel, 
    applyParallel: applyParallel, 
    applicativeParallel: applicativeParallel, 
    altParallel: altParallel, 
    plusParallel: plusParallel, 
    alternativeParallel: alternativeParallel
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Monad.Cont.Trans":32,"../Control.Monad.Eff":47,"../Control.Monad.Eff.Ref":41,"../Control.Monad.Eff.Unsafe":45,"../Control.Monad.Except.Trans":49,"../Control.Monad.Maybe.Trans":50,"../Control.Monad.Reader.Trans":53,"../Control.Monad.Writer.Trans":60,"../Control.Plus":65,"../Control.Semigroupoid":66,"../Data.Either":79,"../Data.Foldable":86,"../Data.Function":91,"../Data.Functor":94,"../Data.Maybe":104,"../Data.Monoid":111,"../Data.Semigroup":121,"../Data.Traversable":131,"../Data.Tuple":133,"../Data.Unit":135,"../Prelude":144}],65:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Alt = require("../Control.Alt");
var Data_Functor = require("../Data.Functor");
var Plus = function (__superclass_Control$dotAlt$dotAlt_0, empty) {
    this["__superclass_Control.Alt.Alt_0"] = __superclass_Control$dotAlt$dotAlt_0;
    this.empty = empty;
};
var plusArray = new Plus(function () {
    return Control_Alt.altArray;
}, [  ]);
var empty = function (dict) {
    return dict.empty;
};
module.exports = {
    Plus: Plus, 
    empty: empty, 
    plusArray: plusArray
};

},{"../Control.Alt":12,"../Data.Functor":94}],66:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Semigroupoid = function (compose) {
    this.compose = compose;
};
var semigroupoidFn = new Semigroupoid(function (f) {
    return function (g) {
        return function (x) {
            return f(g(x));
        };
    };
});
var compose = function (dict) {
    return dict.compose;
};
var composeFlipped = function (dictSemigroupoid) {
    return function (f) {
        return function (g) {
            return compose(dictSemigroupoid)(g)(f);
        };
    };
};
module.exports = {
    Semigroupoid: Semigroupoid, 
    compose: compose, 
    composeFlipped: composeFlipped, 
    semigroupoidFn: semigroupoidFn
};

},{}],67:[function(require,module,exports){
var xs = require('xstream').default;
var flattenConcurrently = require('xstream/extra/flattenConcurrently').default;
var concat = require('xstream/extra/concat').default;
var delay = require('xstream/extra/delay').default;

exports._addListener = function (effL, s) {
  return function () {
    return s.addListener({
      next: function (a) {
        return effL.next(a)();
      },
      error: function (e) {
        return effL.error(e)();
      },
      complete: function () {
        return effL.complete()();
      }
    });
  };
};

exports._combine = function (p, s1, s2) {
  return xs.combine(
    s1,
    s2
  ).map(function (r) {
    return p(r[0])(r[1]);
  });
};

exports._concat = function (s1, s2) {
  return concat(s1, s2);
};

exports._delay = function (i, s) {
  return function () {
    return s.compose(delay(i));
  };
};

exports._drop = function (s, i) {
  return s.drop(i);
};

exports._fold = function (s, p, x) {
  return s.fold(function (b, a) {
    return p(b)(a);
  }, x);
};

exports._empty = xs.empty();

exports._endWhen = function (s1, s2) {
  return s1.endWhen(s2);
};

exports._filter = function(s, p) {
  return s.filter(p);
};

exports._flatMap = function (s, p) {
  return s.map(function (a) {
    return p(a);
  }).compose(flattenConcurrently);
};

exports._flatMapEff = function (s, effP) {
  return function () {
    return s.map(function (a) {
      var result = effP(a)();
      return result;
    }).compose(flattenConcurrently);
  };
};

exports._imitate = function (s1, s2) {
  return function () {
    s1.imitate(s2);
  };
};

exports._last = function (s) {
  return s.last();
};

exports._map = function (p, s) {
  return s.map(p);
};

exports._mapTo = function (s, v) {
  return s.mapTo(v);
};

exports._merge = function (s1, s2) {
  return xs.merge(s1, s2);
};

exports._of = xs.of;

exports._startWith = function (s, x) {
  return s.startWith(x);
};

exports._replaceError = function (s, p) {
  return s.replaceError(p);
}

exports._take = function (s, i) {
  return s.take(i);
};

var adaptListenerToEff = function (l) {
  return {
    next: function (x) {
      return function () {
        l.next(x);
      }
    },
    error: function (e) {
      return function () {
        l.error(e);
      }
    },
    complete: function () {
      return function () {
        l.complete();
      }
    }
  };
};

var adaptEffProducer = function (p) {
  return {
    start: function (x) {
      return p.start(adaptListenerToEff(x))();
    },
    stop: function () {
      return p.stop()();
    }
  };
};

exports.create = function (p) {
  return function () {
    return xs.create(adaptEffProducer(p));
  };
};

exports["create'"] = function () {
  return function () {
    return xs.create();
  };
};

exports.createWithMemory = function (p) {
  return function () {
    return xs.createWithMemory(adaptEffProducer(p));
  };
};

exports.flatten = function (s) {
  return s.flatten();
};

exports.flattenEff = function (s) {
  return function () {
    return s.map(function (effS) {
      return effS();
    }).flatten();
  };
};

exports.fromArray = xs.fromArray;

exports.never = xs.never();

exports.periodic = function (t) {
  return function () {
    return xs.periodic(t);
  };
};

exports.remember = function (s) {
  return s.remember()
};

exports.throw = xs.throw;

exports.unsafeLog = function (a) {
  return function () {
    console.log(a);
  }
}

},{"xstream":11,"xstream/extra/concat":8,"xstream/extra/delay":9,"xstream/extra/flattenConcurrently":10}],68:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Control_Alt = require("../Control.Alt");
var Control_Monad_Aff = require("../Control.Monad.Aff");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Class = require("../Control.Monad.Eff.Class");
var Control_Monad_Eff_Console = require("../Control.Monad.Eff.Console");
var Control_Monad_Eff_Exception = require("../Control.Monad.Eff.Exception");
var Control_Monad_Eff_Ref = require("../Control.Monad.Eff.Ref");
var Control_Monad_Eff_Timer = require("../Control.Monad.Eff.Timer");
var Control_Plus = require("../Control.Plus");
var Data_Either = require("../Data.Either");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
var Data_Maybe = require("../Data.Maybe");
var Data_Functor = require("../Data.Functor");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Control_Applicative = require("../Control.Applicative");
var Control_Bind = require("../Control.Bind");
var Control_Monad = require("../Control.Monad");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Function = require("../Data.Function");
var Data_Unit = require("../Data.Unit");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var take = function (i) {
    return function (s) {
        return $foreign._take(s, i);
    };
};
var startWith = function (x) {
    return function (s) {
        return $foreign._startWith(s, x);
    };
};
var semigroupStream = new Data_Semigroup.Semigroup(Data_Function_Uncurried.runFn2($foreign._concat));
var replaceError = function (p) {
    return function (s) {
        return $foreign._replaceError(s, p);
    };
};
var mapTo = function (v) {
    return function (s) {
        return $foreign._mapTo(s, v);
    };
};
var last = function (s) {
    return $foreign._last(s);
};
var imitate = function (s1) {
    return function (s2) {
        return Data_Function.apply(Control_Monad_Eff_Exception["try"])($foreign._imitate(s1, s2));
    };
};
var functorStream = new Data_Functor.Functor(Data_Function_Uncurried.runFn2($foreign._map));
var fromCallback = function (cb) {
    return $foreign.create({
        start: function (l) {
            return Data_Function.apply(Data_Functor["void"](Control_Monad_Eff.functorEff))(cb(l.next));
        }, 
        stop: Data_Function.apply(Data_Function["const"])(Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit))
    });
};
var fromAff = function (aff) {
    return function __do() {
        var v = Control_Monad_Eff_Ref.newRef(Data_Maybe.Nothing.value)();
        return $foreign.create({
            start: function (l) {
                return function __do() {
                    var v1 = Control_Monad_Aff.runAff(l.error)(function (a) {
                        return function __do() {
                            l.next(a)();
                            return l.complete(Data_Unit.unit)();
                        };
                    })(aff)();
                    return Data_Function.apply(Control_Monad_Eff_Class.liftEff(Control_Monad_Eff_Class.monadEffEff))(Data_Function.apply(Control_Monad_Eff_Ref.writeRef(v))(new Data_Maybe.Just(v1)))();
                };
            }, 
            stop: function (v1) {
                return function __do() {
                    var v2 = Control_Monad_Eff_Ref.readRef(v)();
                    if (v2 instanceof Data_Maybe.Just) {
                        return Data_Function.apply(Data_Functor["void"](Control_Monad_Eff.functorEff))(Data_Function.apply(Control_Monad_Aff.runAff(Data_Function.apply(Data_Function["const"])(Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit)))(Data_Function.apply(Data_Function["const"])(Control_Applicative.pure(Control_Monad_Eff.applicativeEff)(Data_Unit.unit))))(Control_Monad_Aff.cancel(v2.value0)(Control_Monad_Eff_Exception.error("Unsubscribed"))))();
                    };
                    if (v2 instanceof Data_Maybe.Nothing) {
                        return Data_Unit.unit;
                    };
                    throw new Error("Failed pattern match at Control.XStream line 159, column 9 - line 161, column 31: " + [ v2.constructor.name ]);
                };
            }
        })();
    };
};
var fold = function (s) {
    return function (p) {
        return function (x) {
            return $foreign._fold(s, p, x);
        };
    };
};
var filter = function (p) {
    return function (s) {
        return $foreign._filter(s, p);
    };
};
var endWhen = function (s1) {
    return function (s2) {
        return $foreign._endWhen(s1, s2);
    };
};
var drop = function (i) {
    return function (s) {
        return $foreign._drop(s, i);
    };
};
var delay = function (i) {
    return function (s) {
        return $foreign._delay(i, s);
    };
};
var defaultListener = {
    next: $foreign.unsafeLog, 
    error: function ($10) {
        return Control_Monad_Eff_Console.log(Control_Monad_Eff_Exception.message($10));
    }, 
    complete: Control_Applicative.pure(Control_Monad_Eff.applicativeEff)
};
var bindEff = function (s) {
    return function (effP) {
        return $foreign._flatMapEff(s, effP);
    };
};
var applyStream = new Control_Apply.Apply(function () {
    return functorStream;
}, Data_Function_Uncurried.runFn3($foreign._combine)(Control_Category.id(Control_Category.categoryFn)));
var bindStream = new Control_Bind.Bind(function () {
    return applyStream;
}, Data_Function_Uncurried.runFn2($foreign._flatMap));
var applicativeStream = new Control_Applicative.Applicative(function () {
    return applyStream;
}, $foreign._of);
var monadStream = new Control_Monad.Monad(function () {
    return applicativeStream;
}, function () {
    return bindStream;
});
var altStream = new Control_Alt.Alt(function () {
    return functorStream;
}, Data_Function_Uncurried.runFn2($foreign._merge));
var plusStream = new Control_Plus.Plus(function () {
    return altStream;
}, $foreign._empty);
var addListener = function (l) {
    return function (s) {
        return $foreign._addListener(l, s);
    };
};
module.exports = {
    addListener: addListener, 
    bindEff: bindEff, 
    defaultListener: defaultListener, 
    delay: delay, 
    drop: drop, 
    endWhen: endWhen, 
    filter: filter, 
    fold: fold, 
    fromAff: fromAff, 
    fromCallback: fromCallback, 
    imitate: imitate, 
    last: last, 
    mapTo: mapTo, 
    replaceError: replaceError, 
    startWith: startWith, 
    take: take, 
    functorStream: functorStream, 
    applyStream: applyStream, 
    applicativeStream: applicativeStream, 
    bindStream: bindStream, 
    monadStream: monadStream, 
    semigroupStream: semigroupStream, 
    altStream: altStream, 
    plusStream: plusStream, 
    create: $foreign.create, 
    "create'": $foreign["create'"], 
    createWithMemory: $foreign.createWithMemory, 
    flatten: $foreign.flatten, 
    flattenEff: $foreign.flattenEff, 
    fromArray: $foreign.fromArray, 
    never: $foreign.never, 
    periodic: $foreign.periodic, 
    remember: $foreign.remember, 
    "throw": $foreign["throw"]
};

},{"../Control.Alt":12,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Monad":61,"../Control.Monad.Aff":30,"../Control.Monad.Eff":47,"../Control.Monad.Eff.Class":33,"../Control.Monad.Eff.Console":35,"../Control.Monad.Eff.Exception":37,"../Control.Monad.Eff.Ref":41,"../Control.Monad.Eff.Timer":43,"../Control.Plus":65,"../Control.Semigroupoid":66,"../Data.Either":79,"../Data.Function":91,"../Data.Function.Uncurried":90,"../Data.Functor":94,"../Data.Maybe":104,"../Data.Semigroup":121,"../Data.Unit":135,"../Prelude":144,"./foreign":67}],69:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
module.exports = {};

},{}],70:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Function = require("../Data.Function");
var Data_Monoid = require("../Data.Monoid");
var Data_Monoid_Conj = require("../Data.Monoid.Conj");
var Data_Monoid_Disj = require("../Data.Monoid.Disj");
var Data_Monoid_Dual = require("../Data.Monoid.Dual");
var Data_Monoid_Endo = require("../Data.Monoid.Endo");
var Data_Unit = require("../Data.Unit");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Category = require("../Control.Category");
var Data_Semigroup = require("../Data.Semigroup");
var Bifoldable = function (bifoldMap, bifoldl, bifoldr) {
    this.bifoldMap = bifoldMap;
    this.bifoldl = bifoldl;
    this.bifoldr = bifoldr;
};
var bifoldr = function (dict) {
    return dict.bifoldr;
};
var bitraverse_ = function (dictBifoldable) {
    return function (dictApplicative) {
        return function (f) {
            return function (g) {
                return bifoldr(dictBifoldable)(function ($18) {
                    return Control_Apply.applySecond(dictApplicative["__superclass_Control.Apply.Apply_0"]())(f($18));
                })(function ($19) {
                    return Control_Apply.applySecond(dictApplicative["__superclass_Control.Apply.Apply_0"]())(g($19));
                })(Control_Applicative.pure(dictApplicative)(Data_Unit.unit));
            };
        };
    };
};
var bifor_ = function (dictBifoldable) {
    return function (dictApplicative) {
        return function (t) {
            return function (f) {
                return function (g) {
                    return bitraverse_(dictBifoldable)(dictApplicative)(f)(g)(t);
                };
            };
        };
    };
};
var bisequence_ = function (dictBifoldable) {
    return function (dictApplicative) {
        return bitraverse_(dictBifoldable)(dictApplicative)(Control_Category.id(Control_Category.categoryFn))(Control_Category.id(Control_Category.categoryFn));
    };
};
var bifoldl = function (dict) {
    return dict.bifoldl;
};
var bifoldMapDefaultR = function (dictBifoldable) {
    return function (dictMonoid) {
        return function (f) {
            return function (g) {
                return function (p) {
                    return bifoldr(dictBifoldable)(function ($20) {
                        return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(f($20));
                    })(function ($21) {
                        return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(g($21));
                    })(Data_Monoid.mempty(dictMonoid))(p);
                };
            };
        };
    };
};
var bifoldMapDefaultL = function (dictBifoldable) {
    return function (dictMonoid) {
        return function (f) {
            return function (g) {
                return function (p) {
                    return bifoldl(dictBifoldable)(function (m) {
                        return function (a) {
                            return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(m)(f(a));
                        };
                    })(function (m) {
                        return function (b) {
                            return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(m)(g(b));
                        };
                    })(Data_Monoid.mempty(dictMonoid))(p);
                };
            };
        };
    };
};
var bifoldMap = function (dict) {
    return dict.bifoldMap;
};
var bifoldlDefault = function (dictBifoldable) {
    return function (f) {
        return function (g) {
            return function (z) {
                return function (p) {
                    return Data_Monoid_Endo.runEndo(Data_Monoid_Dual.runDual(bifoldMap(dictBifoldable)(Data_Monoid_Dual.monoidDual(Data_Monoid_Endo.monoidEndo))(function ($22) {
                        return Data_Monoid_Dual.Dual(Data_Monoid_Endo.Endo(Data_Function.flip(f)($22)));
                    })(function ($23) {
                        return Data_Monoid_Dual.Dual(Data_Monoid_Endo.Endo(Data_Function.flip(g)($23)));
                    })(p)))(z);
                };
            };
        };
    };
};
var bifoldrDefault = function (dictBifoldable) {
    return function (f) {
        return function (g) {
            return function (z) {
                return function (p) {
                    return Data_Monoid_Endo.runEndo(bifoldMap(dictBifoldable)(Data_Monoid_Endo.monoidEndo)(function ($24) {
                        return Data_Monoid_Endo.Endo(f($24));
                    })(function ($25) {
                        return Data_Monoid_Endo.Endo(g($25));
                    })(p))(z);
                };
            };
        };
    };
};
var bifold = function (dictBifoldable) {
    return function (dictMonoid) {
        return bifoldMap(dictBifoldable)(dictMonoid)(Control_Category.id(Control_Category.categoryFn))(Control_Category.id(Control_Category.categoryFn));
    };
};
var biany = function (dictBifoldable) {
    return function (dictBooleanAlgebra) {
        return function (p) {
            return function (q) {
                return function ($26) {
                    return Data_Monoid_Disj.runDisj(bifoldMap(dictBifoldable)(Data_Monoid_Disj.monoidDisj(dictBooleanAlgebra["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]()))(function ($27) {
                        return Data_Monoid_Disj.Disj(p($27));
                    })(function ($28) {
                        return Data_Monoid_Disj.Disj(q($28));
                    })($26));
                };
            };
        };
    };
};
var biall = function (dictBifoldable) {
    return function (dictBooleanAlgebra) {
        return function (p) {
            return function (q) {
                return function ($29) {
                    return Data_Monoid_Conj.runConj(bifoldMap(dictBifoldable)(Data_Monoid_Conj.monoidConj(dictBooleanAlgebra["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]()))(function ($30) {
                        return Data_Monoid_Conj.Conj(p($30));
                    })(function ($31) {
                        return Data_Monoid_Conj.Conj(q($31));
                    })($29));
                };
            };
        };
    };
};
module.exports = {
    Bifoldable: Bifoldable, 
    biall: biall, 
    biany: biany, 
    bifold: bifold, 
    bifoldMap: bifoldMap, 
    bifoldMapDefaultL: bifoldMapDefaultL, 
    bifoldMapDefaultR: bifoldMapDefaultR, 
    bifoldl: bifoldl, 
    bifoldlDefault: bifoldlDefault, 
    bifoldr: bifoldr, 
    bifoldrDefault: bifoldrDefault, 
    bifor_: bifor_, 
    bisequence_: bisequence_, 
    bitraverse_: bitraverse_
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Category":21,"../Control.Semigroupoid":66,"../Data.BooleanAlgebra":74,"../Data.Function":91,"../Data.Monoid":111,"../Data.Monoid.Conj":106,"../Data.Monoid.Disj":107,"../Data.Monoid.Dual":108,"../Data.Monoid.Endo":109,"../Data.Semigroup":121,"../Data.Unit":135}],71:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Category = require("../Control.Category");
var Bifunctor = function (bimap) {
    this.bimap = bimap;
};
var bimap = function (dict) {
    return dict.bimap;
};
var lmap = function (dictBifunctor) {
    return function (f) {
        return bimap(dictBifunctor)(f)(Control_Category.id(Control_Category.categoryFn));
    };
};
var rmap = function (dictBifunctor) {
    return bimap(dictBifunctor)(Control_Category.id(Control_Category.categoryFn));
};
module.exports = {
    Bifunctor: Bifunctor, 
    bimap: bimap, 
    lmap: lmap, 
    rmap: rmap
};

},{"../Control.Category":21}],72:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Category = require("../Control.Category");
var Data_Bifoldable = require("../Data.Bifoldable");
var Data_Bifunctor = require("../Data.Bifunctor");
var Bitraversable = function (__superclass_Data$dotBifoldable$dotBifoldable_1, __superclass_Data$dotBifunctor$dotBifunctor_0, bisequence, bitraverse) {
    this["__superclass_Data.Bifoldable.Bifoldable_1"] = __superclass_Data$dotBifoldable$dotBifoldable_1;
    this["__superclass_Data.Bifunctor.Bifunctor_0"] = __superclass_Data$dotBifunctor$dotBifunctor_0;
    this.bisequence = bisequence;
    this.bitraverse = bitraverse;
};
var bitraverse = function (dict) {
    return dict.bitraverse;
};
var bisequenceDefault = function (dictBitraversable) {
    return function (dictApplicative) {
        return function (t) {
            return bitraverse(dictBitraversable)(dictApplicative)(Control_Category.id(Control_Category.categoryFn))(Control_Category.id(Control_Category.categoryFn))(t);
        };
    };
};
var bisequence = function (dict) {
    return dict.bisequence;
};
var bitraverseDefault = function (dictBitraversable) {
    return function (dictApplicative) {
        return function (f) {
            return function (g) {
                return function (t) {
                    return bisequence(dictBitraversable)(dictApplicative)(Data_Bifunctor.bimap(dictBitraversable["__superclass_Data.Bifunctor.Bifunctor_0"]())(f)(g)(t));
                };
            };
        };
    };
};
var bifor = function (dictBitraversable) {
    return function (dictApplicative) {
        return function (t) {
            return function (f) {
                return function (g) {
                    return bitraverse(dictBitraversable)(dictApplicative)(f)(g)(t);
                };
            };
        };
    };
};
module.exports = {
    Bitraversable: Bitraversable, 
    bifor: bifor, 
    bisequence: bisequence, 
    bisequenceDefault: bisequenceDefault, 
    bitraverse: bitraverse, 
    bitraverseDefault: bitraverseDefault
};

},{"../Control.Applicative":14,"../Control.Category":21,"../Data.Bifoldable":70,"../Data.Bifunctor":71}],73:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var otherwise = true;
module.exports = {
    otherwise: otherwise
};

},{}],74:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Unit = require("../Data.Unit");
var BooleanAlgebra = function (__superclass_Data$dotHeytingAlgebra$dotHeytingAlgebra_0) {
    this["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"] = __superclass_Data$dotHeytingAlgebra$dotHeytingAlgebra_0;
};
var booleanAlgebraUnit = new BooleanAlgebra(function () {
    return Data_HeytingAlgebra.heytingAlgebraUnit;
});
var booleanAlgebraBoolean = new BooleanAlgebra(function () {
    return Data_HeytingAlgebra.heytingAlgebraBoolean;
});
module.exports = {
    BooleanAlgebra: BooleanAlgebra, 
    booleanAlgebraBoolean: booleanAlgebraBoolean, 
    booleanAlgebraUnit: booleanAlgebraUnit
};

},{"../Data.HeytingAlgebra":96,"../Data.Unit":135}],75:[function(require,module,exports){
"use strict";

// module Data.Bounded

exports.topInt = 2147483647;
exports.bottomInt = -2147483648;

exports.topChar = String.fromCharCode(65535);
exports.bottomChar = String.fromCharCode(0);

},{}],76:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Ord = require("../Data.Ord");
var Data_Unit = require("../Data.Unit");
var Data_Ordering = require("../Data.Ordering");
var Bounded = function (__superclass_Data$dotOrd$dotOrd_0, bottom, top) {
    this["__superclass_Data.Ord.Ord_0"] = __superclass_Data$dotOrd$dotOrd_0;
    this.bottom = bottom;
    this.top = top;
};
var top = function (dict) {
    return dict.top;
};
var boundedUnit = new Bounded(function () {
    return Data_Ord.ordUnit;
}, Data_Unit.unit, Data_Unit.unit);
var boundedOrdering = new Bounded(function () {
    return Data_Ord.ordOrdering;
}, Data_Ordering.LT.value, Data_Ordering.GT.value);
var boundedInt = new Bounded(function () {
    return Data_Ord.ordInt;
}, $foreign.bottomInt, $foreign.topInt);
var boundedChar = new Bounded(function () {
    return Data_Ord.ordChar;
}, $foreign.bottomChar, $foreign.topChar);
var boundedBoolean = new Bounded(function () {
    return Data_Ord.ordBoolean;
}, false, true);
var bottom = function (dict) {
    return dict.bottom;
};
module.exports = {
    Bounded: Bounded, 
    bottom: bottom, 
    top: top, 
    boundedBoolean: boundedBoolean, 
    boundedInt: boundedInt, 
    boundedChar: boundedChar, 
    boundedOrdering: boundedOrdering, 
    boundedUnit: boundedUnit
};

},{"../Data.Ord":116,"../Data.Ordering":117,"../Data.Unit":135,"./foreign":75}],77:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_Ring = require("../Data.Ring");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var CommutativeRing = function (__superclass_Data$dotRing$dotRing_0) {
    this["__superclass_Data.Ring.Ring_0"] = __superclass_Data$dotRing$dotRing_0;
};
var commutativeRingUnit = new CommutativeRing(function () {
    return Data_Ring.ringUnit;
});
var commutativeRingNumber = new CommutativeRing(function () {
    return Data_Ring.ringNumber;
});
var commutativeRingInt = new CommutativeRing(function () {
    return Data_Ring.ringInt;
});
module.exports = {
    CommutativeRing: CommutativeRing, 
    commutativeRingInt: commutativeRingInt, 
    commutativeRingNumber: commutativeRingNumber, 
    commutativeRingUnit: commutativeRingUnit
};

},{"../Data.Ring":119,"../Data.Semiring":123,"../Data.Unit":135}],78:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Identity = require("../Data.Identity");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Category = require("../Control.Category");
var Distributive = function (__superclass_Data$dotFunctor$dotFunctor_0, collect, distribute) {
    this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
    this.collect = collect;
    this.distribute = distribute;
};
var distributiveIdentity = new Distributive(function () {
    return Data_Identity.functorIdentity;
}, function (dictFunctor) {
    return function (f) {
        return function ($11) {
            return Data_Identity.Identity(Data_Functor.map(dictFunctor)(function ($12) {
                return Data_Identity.runIdentity(f($12));
            })($11));
        };
    };
}, function (dictFunctor) {
    return function ($13) {
        return Data_Identity.Identity(Data_Functor.map(dictFunctor)(Data_Identity.runIdentity)($13));
    };
});
var distribute = function (dict) {
    return dict.distribute;
};
var distributiveFunction = new Distributive(function () {
    return Data_Functor.functorFn;
}, function (dictFunctor) {
    return function (f) {
        return function ($14) {
            return distribute(distributiveFunction)(dictFunctor)(Data_Functor.map(dictFunctor)(f)($14));
        };
    };
}, function (dictFunctor) {
    return function (a) {
        return function (e) {
            return Data_Functor.map(dictFunctor)(function (v) {
                return Data_Function.apply(v)(e);
            })(a);
        };
    };
});
var cotraverse = function (dictDistributive) {
    return function (dictFunctor) {
        return function (f) {
            return function ($15) {
                return Data_Functor.map(dictDistributive["__superclass_Data.Functor.Functor_0"]())(f)(distribute(dictDistributive)(dictFunctor)($15));
            };
        };
    };
};
var collectDefault = function (dictDistributive) {
    return function (dictFunctor) {
        return function (f) {
            return function ($16) {
                return distribute(dictDistributive)(dictFunctor)(Data_Functor.map(dictFunctor)(f)($16));
            };
        };
    };
};
var collect = function (dict) {
    return dict.collect;
};
var distributeDefault = function (dictDistributive) {
    return function (dictFunctor) {
        return collect(dictDistributive)(dictFunctor)(Control_Category.id(Control_Category.categoryFn));
    };
};
module.exports = {
    Distributive: Distributive, 
    collect: collect, 
    collectDefault: collectDefault, 
    cotraverse: cotraverse, 
    distribute: distribute, 
    distributeDefault: distributeDefault, 
    distributiveIdentity: distributiveIdentity, 
    distributiveFunction: distributiveFunction
};

},{"../Control.Category":21,"../Control.Semigroupoid":66,"../Data.Function":91,"../Data.Functor":94,"../Data.Identity":97}],79:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bifoldable = require("../Data.Bifoldable");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Bitraversable = require("../Data.Bitraversable");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Data_Traversable = require("../Data.Traversable");
var Left = (function () {
    function Left(value0) {
        this.value0 = value0;
    };
    Left.create = function (value0) {
        return new Left(value0);
    };
    return Left;
})();
var Right = (function () {
    function Right(value0) {
        this.value0 = value0;
    };
    Right.create = function (value0) {
        return new Right(value0);
    };
    return Right;
})();
var showEither = function (dictShow) {
    return function (dictShow1) {
        return new Data_Show.Show(function (v) {
            if (v instanceof Left) {
                return "(Left " + (Data_Show.show(dictShow)(v.value0) + ")");
            };
            if (v instanceof Right) {
                return "(Right " + (Data_Show.show(dictShow1)(v.value0) + ")");
            };
            throw new Error("Failed pattern match at Data.Either line 171, column 3 - line 172, column 3: " + [ v.constructor.name ]);
        });
    };
};
var functorEither = new Data_Functor.Functor(function (v) {
    return function (v1) {
        if (v1 instanceof Left) {
            return new Left(v1.value0);
        };
        if (v1 instanceof Right) {
            return new Right(v(v1.value0));
        };
        throw new Error("Failed pattern match at Data.Either line 46, column 3 - line 46, column 26: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var invariantEither = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorEither));
var fromRight = function (dictPartial) {
    return function (v) {
        var __unused = function (dictPartial1) {
            return function ($dollar52) {
                return $dollar52;
            };
        };
        return __unused(dictPartial)((function () {
            if (v instanceof Right) {
                return v.value0;
            };
            throw new Error("Failed pattern match at Data.Either line 262, column 1 - line 262, column 23: " + [ v.constructor.name ]);
        })());
    };
};
var fromLeft = function (dictPartial) {
    return function (v) {
        var __unused = function (dictPartial1) {
            return function ($dollar56) {
                return $dollar56;
            };
        };
        return __unused(dictPartial)((function () {
            if (v instanceof Left) {
                return v.value0;
            };
            throw new Error("Failed pattern match at Data.Either line 257, column 1 - line 257, column 22: " + [ v.constructor.name ]);
        })());
    };
};
var foldableEither = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            if (v instanceof Left) {
                return Data_Monoid.mempty(dictMonoid);
            };
            if (v instanceof Right) {
                return f(v.value0);
            };
            throw new Error("Failed pattern match at Data.Either line 202, column 3 - line 202, column 31: " + [ f.constructor.name, v.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Left) {
                return z;
            };
            if (v1 instanceof Right) {
                return v(z)(v1.value0);
            };
            throw new Error("Failed pattern match at Data.Either line 200, column 3 - line 200, column 26: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Left) {
                return z;
            };
            if (v1 instanceof Right) {
                return v(v1.value0)(z);
            };
            throw new Error("Failed pattern match at Data.Either line 198, column 3 - line 198, column 26: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
});
var traversableEither = new Data_Traversable.Traversable(function () {
    return foldableEither;
}, function () {
    return functorEither;
}, function (dictApplicative) {
    return function (v) {
        if (v instanceof Left) {
            return Control_Applicative.pure(dictApplicative)(new Left(v.value0));
        };
        if (v instanceof Right) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Right.create)(v.value0);
        };
        throw new Error("Failed pattern match at Data.Either line 216, column 3 - line 216, column 36: " + [ v.constructor.name ]);
    };
}, function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Left) {
                return Control_Applicative.pure(dictApplicative)(new Left(v1.value0));
            };
            if (v1 instanceof Right) {
                return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Right.create)(v(v1.value0));
            };
            throw new Error("Failed pattern match at Data.Either line 214, column 3 - line 214, column 39: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
});
var extendEither = new Control_Extend.Extend(function () {
    return functorEither;
}, function (v) {
    return function (v1) {
        if (v1 instanceof Left) {
            return new Left(v1.value0);
        };
        return new Right(v(v1));
    };
});
var eqEither = function (dictEq) {
    return function (dictEq1) {
        return new Data_Eq.Eq(function (v) {
            return function (v1) {
                if (v instanceof Left && v1 instanceof Left) {
                    return Data_Eq.eq(dictEq)(v.value0)(v1.value0);
                };
                if (v instanceof Right && v1 instanceof Right) {
                    return Data_Eq.eq(dictEq1)(v.value0)(v1.value0);
                };
                return false;
            };
        });
    };
};
var ordEither = function (dictOrd) {
    return function (dictOrd1) {
        return new Data_Ord.Ord(function () {
            return eqEither(dictOrd["__superclass_Data.Eq.Eq_0"]())(dictOrd1["__superclass_Data.Eq.Eq_0"]());
        }, function (v) {
            return function (v1) {
                if (v instanceof Left && v1 instanceof Left) {
                    return Data_Ord.compare(dictOrd)(v.value0)(v1.value0);
                };
                if (v instanceof Right && v1 instanceof Right) {
                    return Data_Ord.compare(dictOrd1)(v.value0)(v1.value0);
                };
                if (v instanceof Left) {
                    return Data_Ordering.LT.value;
                };
                if (v1 instanceof Left) {
                    return Data_Ordering.GT.value;
                };
                throw new Error("Failed pattern match at Data.Either line 188, column 3 - line 188, column 48: " + [ v.constructor.name, v1.constructor.name ]);
            };
        });
    };
};
var either = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Left) {
                return v(v2.value0);
            };
            if (v2 instanceof Right) {
                return v1(v2.value0);
            };
            throw new Error("Failed pattern match at Data.Either line 243, column 1 - line 243, column 26: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
};
var isLeft = either(Data_Function["const"](true))(Data_Function["const"](false));
var isRight = either(Data_Function["const"](false))(Data_Function["const"](true));
var boundedEither = function (dictBounded) {
    return function (dictBounded1) {
        return new Data_Bounded.Bounded(function () {
            return ordEither(dictBounded["__superclass_Data.Ord.Ord_0"]())(dictBounded1["__superclass_Data.Ord.Ord_0"]());
        }, new Left(Data_Bounded.bottom(dictBounded)), new Right(Data_Bounded.top(dictBounded1)));
    };
};
var bifunctorEither = new Data_Bifunctor.Bifunctor(function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Left) {
                return new Left(v(v2.value0));
            };
            if (v2 instanceof Right) {
                return new Right(v1(v2.value0));
            };
            throw new Error("Failed pattern match at Data.Either line 53, column 3 - line 53, column 34: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
});
var bifoldableEither = new Data_Bifoldable.Bifoldable(function (dictMonoid) {
    return function (v) {
        return function (v1) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return v(v2.value0);
                };
                if (v2 instanceof Right) {
                    return v1(v2.value0);
                };
                throw new Error("Failed pattern match at Data.Either line 210, column 3 - line 210, column 31: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
            };
        };
    };
}, function (v) {
    return function (v1) {
        return function (z) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return v(z)(v2.value0);
                };
                if (v2 instanceof Right) {
                    return v1(z)(v2.value0);
                };
                throw new Error("Failed pattern match at Data.Either line 208, column 3 - line 208, column 33: " + [ v.constructor.name, v1.constructor.name, z.constructor.name, v2.constructor.name ]);
            };
        };
    };
}, function (v) {
    return function (v1) {
        return function (z) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return v(v2.value0)(z);
                };
                if (v2 instanceof Right) {
                    return v1(v2.value0)(z);
                };
                throw new Error("Failed pattern match at Data.Either line 206, column 3 - line 206, column 33: " + [ v.constructor.name, v1.constructor.name, z.constructor.name, v2.constructor.name ]);
            };
        };
    };
});
var bitraversableEither = new Data_Bitraversable.Bitraversable(function () {
    return bifoldableEither;
}, function () {
    return bifunctorEither;
}, function (dictApplicative) {
    return function (v) {
        if (v instanceof Left) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Left.create)(v.value0);
        };
        if (v instanceof Right) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Right.create)(v.value0);
        };
        throw new Error("Failed pattern match at Data.Either line 222, column 3 - line 222, column 35: " + [ v.constructor.name ]);
    };
}, function (dictApplicative) {
    return function (v) {
        return function (v1) {
            return function (v2) {
                if (v2 instanceof Left) {
                    return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Left.create)(v(v2.value0));
                };
                if (v2 instanceof Right) {
                    return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Right.create)(v1(v2.value0));
                };
                throw new Error("Failed pattern match at Data.Either line 220, column 3 - line 220, column 41: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
            };
        };
    };
});
var applyEither = new Control_Apply.Apply(function () {
    return functorEither;
}, function (v) {
    return function (v1) {
        if (v instanceof Left) {
            return new Left(v.value0);
        };
        if (v instanceof Right) {
            return Data_Functor.map(functorEither)(v.value0)(v1);
        };
        throw new Error("Failed pattern match at Data.Either line 89, column 3 - line 89, column 28: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var bindEither = new Control_Bind.Bind(function () {
    return applyEither;
}, either(function (e) {
    return function (v) {
        return new Left(e);
    };
})(function (a) {
    return function (f) {
        return f(a);
    };
}));
var semigroupEither = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (x) {
        return function (y) {
            return Control_Apply.apply(applyEither)(Data_Functor.map(functorEither)(Data_Semigroup.append(dictSemigroup))(x))(y);
        };
    });
};
var semiringEither = function (dictSemiring) {
    return new Data_Semiring.Semiring(function (x) {
        return function (y) {
            return Control_Apply.apply(applyEither)(Data_Functor.map(functorEither)(Data_Semiring.add(dictSemiring))(x))(y);
        };
    }, function (x) {
        return function (y) {
            return Control_Apply.apply(applyEither)(Data_Functor.map(functorEither)(Data_Semiring.mul(dictSemiring))(x))(y);
        };
    }, new Right(Data_Semiring.one(dictSemiring)), new Right(Data_Semiring.zero(dictSemiring)));
};
var applicativeEither = new Control_Applicative.Applicative(function () {
    return applyEither;
}, Right.create);
var monadEither = new Control_Monad.Monad(function () {
    return applicativeEither;
}, function () {
    return bindEither;
});
var altEither = new Control_Alt.Alt(function () {
    return functorEither;
}, function (v) {
    return function (v1) {
        if (v instanceof Left) {
            return v1;
        };
        return v;
    };
});
module.exports = {
    Left: Left, 
    Right: Right, 
    either: either, 
    fromLeft: fromLeft, 
    fromRight: fromRight, 
    isLeft: isLeft, 
    isRight: isRight, 
    functorEither: functorEither, 
    invariantEither: invariantEither, 
    bifunctorEither: bifunctorEither, 
    applyEither: applyEither, 
    applicativeEither: applicativeEither, 
    altEither: altEither, 
    bindEither: bindEither, 
    monadEither: monadEither, 
    extendEither: extendEither, 
    showEither: showEither, 
    eqEither: eqEither, 
    ordEither: ordEither, 
    boundedEither: boundedEither, 
    foldableEither: foldableEither, 
    bifoldableEither: bifoldableEither, 
    traversableEither: traversableEither, 
    bitraversableEither: bitraversableEither, 
    semiringEither: semiringEither, 
    semigroupEither: semigroupEither
};

},{"../Control.Alt":12,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bifoldable":70,"../Data.Bifunctor":71,"../Data.Bitraversable":72,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":91,"../Data.Functor":94,"../Data.Functor.Invariant":92,"../Data.Monoid":111,"../Data.Ord":116,"../Data.Ordering":117,"../Data.Semigroup":121,"../Data.Semiring":123,"../Data.Show":125,"../Data.Traversable":131}],80:[function(require,module,exports){
"use strict";

// module Data.Eq

exports.refEq = function (r1) {
  return function (r2) {
    return r1 === r2;
  };
};

exports.refIneq = function (r1) {
  return function (r2) {
    return r1 !== r2;
  };
};

exports.eqArrayImpl = function (f) {
  return function (xs) {
    return function (ys) {
      if (xs.length !== ys.length) return false;
      for (var i = 0; i < xs.length; i++) {
        if (!f(xs[i])(ys[i])) return false;
      }
      return true;
    };
  };
};

},{}],81:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
var Eq = function (eq) {
    this.eq = eq;
};
var eqVoid = new Eq(function (v) {
    return function (v1) {
        return true;
    };
});
var eqUnit = new Eq(function (v) {
    return function (v1) {
        return true;
    };
});
var eqString = new Eq($foreign.refEq);
var eqNumber = new Eq($foreign.refEq);
var eqInt = new Eq($foreign.refEq);
var eqChar = new Eq($foreign.refEq);
var eqBoolean = new Eq($foreign.refEq);
var eq = function (dict) {
    return dict.eq;
};
var eqArray = function (dictEq) {
    return new Eq($foreign.eqArrayImpl(eq(dictEq)));
};
var notEq = function (dictEq) {
    return function (x) {
        return function (y) {
            return eq(eqBoolean)(eq(dictEq)(x)(y))(false);
        };
    };
};
module.exports = {
    Eq: Eq, 
    eq: eq, 
    notEq: notEq, 
    eqBoolean: eqBoolean, 
    eqInt: eqInt, 
    eqNumber: eqNumber, 
    eqChar: eqChar, 
    eqString: eqString, 
    eqUnit: eqUnit, 
    eqVoid: eqVoid, 
    eqArray: eqArray
};

},{"../Data.Unit":135,"../Data.Void":136,"./foreign":80}],82:[function(require,module,exports){
"use strict";

// module Data.EuclideanRing

exports.intDegree = function (x) {
  return Math.abs(x);
};

exports.intDiv = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x / y | 0;
  };
};

exports.intMod = function (x) {
  return function (y) {
    return x % y;
  };
};

exports.numDiv = function (n1) {
  return function (n2) {
    return n1 / n2;
  };
};

},{}],83:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_Ring = require("../Data.Ring");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var EuclideanRing = function (__superclass_Data$dotCommutativeRing$dotCommutativeRing_0, degree, div, mod) {
    this["__superclass_Data.CommutativeRing.CommutativeRing_0"] = __superclass_Data$dotCommutativeRing$dotCommutativeRing_0;
    this.degree = degree;
    this.div = div;
    this.mod = mod;
};
var mod = function (dict) {
    return dict.mod;
};
var euclideanRingUnit = new EuclideanRing(function () {
    return Data_CommutativeRing.commutativeRingUnit;
}, function (v) {
    return 1;
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
});
var euclideanRingNumber = new EuclideanRing(function () {
    return Data_CommutativeRing.commutativeRingNumber;
}, function (v) {
    return 1;
}, $foreign.numDiv, function (v) {
    return function (v1) {
        return 0.0;
    };
});
var euclideanRingInt = new EuclideanRing(function () {
    return Data_CommutativeRing.commutativeRingInt;
}, $foreign.intDegree, $foreign.intDiv, $foreign.intMod);
var div = function (dict) {
    return dict.div;
};
var degree = function (dict) {
    return dict.degree;
};
module.exports = {
    EuclideanRing: EuclideanRing, 
    degree: degree, 
    div: div, 
    mod: mod, 
    euclideanRingInt: euclideanRingInt, 
    euclideanRingNumber: euclideanRingNumber, 
    euclideanRingUnit: euclideanRingUnit
};

},{"../Data.CommutativeRing":77,"../Data.Ring":119,"../Data.Semiring":123,"../Data.Unit":135,"./foreign":82}],84:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Ring = require("../Data.Ring");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var Field = function (__superclass_Data$dotEuclideanRing$dotEuclideanRing_0) {
    this["__superclass_Data.EuclideanRing.EuclideanRing_0"] = __superclass_Data$dotEuclideanRing$dotEuclideanRing_0;
};
var fieldUnit = new Field(function () {
    return Data_EuclideanRing.euclideanRingUnit;
});
var fieldNumber = new Field(function () {
    return Data_EuclideanRing.euclideanRingNumber;
});
module.exports = {
    Field: Field, 
    fieldNumber: fieldNumber, 
    fieldUnit: fieldUnit
};

},{"../Data.CommutativeRing":77,"../Data.EuclideanRing":83,"../Data.Ring":119,"../Data.Semiring":123,"../Data.Unit":135}],85:[function(require,module,exports){
"use strict";

exports.foldrArray = function (f) {
  return function (init) {
    return function (xs) {
      var acc = init;
      var len = xs.length;
      for (var i = len - 1; i >= 0; i--) {
        acc = f(xs[i])(acc);
      }
      return acc;
    };
  };
};

exports.foldlArray = function (f) {
  return function (init) {
    return function (xs) {
      var acc = init;
      var len = xs.length;
      for (var i = 0; i < len; i++) {
        acc = f(acc)(xs[i]);
      }
      return acc;
    };
  };
};

},{}],86:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Plus = require("../Control.Plus");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_Maybe = require("../Data.Maybe");
var Data_Maybe_First = require("../Data.Maybe.First");
var Data_Maybe_Last = require("../Data.Maybe.Last");
var Data_Monoid = require("../Data.Monoid");
var Data_Monoid_Additive = require("../Data.Monoid.Additive");
var Data_Monoid_Conj = require("../Data.Monoid.Conj");
var Data_Monoid_Disj = require("../Data.Monoid.Disj");
var Data_Monoid_Dual = require("../Data.Monoid.Dual");
var Data_Monoid_Endo = require("../Data.Monoid.Endo");
var Data_Monoid_Multiplicative = require("../Data.Monoid.Multiplicative");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var Control_Alt = require("../Control.Alt");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Category = require("../Control.Category");
var Data_Semigroup = require("../Data.Semigroup");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Foldable = function (foldMap, foldl, foldr) {
    this.foldMap = foldMap;
    this.foldl = foldl;
    this.foldr = foldr;
};
var foldr = function (dict) {
    return dict.foldr;
};
var oneOf = function (dictFoldable) {
    return function (dictPlus) {
        return foldr(dictFoldable)(Control_Alt.alt(dictPlus["__superclass_Control.Alt.Alt_0"]()))(Control_Plus.empty(dictPlus));
    };
};
var traverse_ = function (dictApplicative) {
    return function (dictFoldable) {
        return function (f) {
            return foldr(dictFoldable)(function ($164) {
                return Control_Apply.applySecond(dictApplicative["__superclass_Control.Apply.Apply_0"]())(f($164));
            })(Control_Applicative.pure(dictApplicative)(Data_Unit.unit));
        };
    };
};
var for_ = function (dictApplicative) {
    return function (dictFoldable) {
        return Data_Function.flip(traverse_(dictApplicative)(dictFoldable));
    };
};
var sequence_ = function (dictApplicative) {
    return function (dictFoldable) {
        return traverse_(dictApplicative)(dictFoldable)(Control_Category.id(Control_Category.categoryFn));
    };
};
var foldl = function (dict) {
    return dict.foldl;
};
var intercalate = function (dictFoldable) {
    return function (dictMonoid) {
        return function (sep) {
            return function (xs) {
                var go = function (v) {
                    return function (x) {
                        if (v.init) {
                            return {
                                init: false, 
                                acc: x
                            };
                        };
                        return {
                            init: false, 
                            acc: Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(v.acc)(Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(sep)(x))
                        };
                    };
                };
                return (foldl(dictFoldable)(go)({
                    init: true, 
                    acc: Data_Monoid.mempty(dictMonoid)
                })(xs)).acc;
            };
        };
    };
};
var maximumBy = function (dictFoldable) {
    return function (cmp) {
        var max$prime = function (v) {
            return function (v1) {
                if (v instanceof Data_Maybe.Nothing) {
                    return new Data_Maybe.Just(v1);
                };
                if (v instanceof Data_Maybe.Just) {
                    return new Data_Maybe.Just((function () {
                        var $89 = Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(v.value0)(v1))(Data_Ordering.GT.value);
                        if ($89) {
                            return v.value0;
                        };
                        if (!$89) {
                            return v1;
                        };
                        throw new Error("Failed pattern match at Data.Foldable line 290, column 27 - line 290, column 57: " + [ $89.constructor.name ]);
                    })());
                };
                throw new Error("Failed pattern match at Data.Foldable line 289, column 3 - line 289, column 27: " + [ v.constructor.name, v1.constructor.name ]);
            };
        };
        return foldl(dictFoldable)(max$prime)(Data_Maybe.Nothing.value);
    };
};
var maximum = function (dictOrd) {
    return function (dictFoldable) {
        return maximumBy(dictFoldable)(Data_Ord.compare(dictOrd));
    };
};
var minimumBy = function (dictFoldable) {
    return function (cmp) {
        var min$prime = function (v) {
            return function (v1) {
                if (v instanceof Data_Maybe.Nothing) {
                    return new Data_Maybe.Just(v1);
                };
                if (v instanceof Data_Maybe.Just) {
                    return new Data_Maybe.Just((function () {
                        var $93 = Data_Eq.eq(Data_Ordering.eqOrdering)(cmp(v.value0)(v1))(Data_Ordering.LT.value);
                        if ($93) {
                            return v.value0;
                        };
                        if (!$93) {
                            return v1;
                        };
                        throw new Error("Failed pattern match at Data.Foldable line 303, column 27 - line 303, column 57: " + [ $93.constructor.name ]);
                    })());
                };
                throw new Error("Failed pattern match at Data.Foldable line 302, column 3 - line 302, column 27: " + [ v.constructor.name, v1.constructor.name ]);
            };
        };
        return foldl(dictFoldable)(min$prime)(Data_Maybe.Nothing.value);
    };
};
var minimum = function (dictOrd) {
    return function (dictFoldable) {
        return minimumBy(dictFoldable)(Data_Ord.compare(dictOrd));
    };
};
var product = function (dictFoldable) {
    return function (dictSemiring) {
        return foldl(dictFoldable)(Data_Semiring.mul(dictSemiring))(Data_Semiring.one(dictSemiring));
    };
};
var sum = function (dictFoldable) {
    return function (dictSemiring) {
        return foldl(dictFoldable)(Data_Semiring.add(dictSemiring))(Data_Semiring.zero(dictSemiring));
    };
};
var foldableMultiplicative = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableMaybe = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            if (v instanceof Data_Maybe.Nothing) {
                return Data_Monoid.mempty(dictMonoid);
            };
            if (v instanceof Data_Maybe.Just) {
                return f(v.value0);
            };
            throw new Error("Failed pattern match at Data.Foldable line 132, column 3 - line 132, column 30: " + [ f.constructor.name, v.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Data_Maybe.Nothing) {
                return z;
            };
            if (v1 instanceof Data_Maybe.Just) {
                return v(z)(v1.value0);
            };
            throw new Error("Failed pattern match at Data.Foldable line 130, column 3 - line 130, column 25: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
}, function (v) {
    return function (z) {
        return function (v1) {
            if (v1 instanceof Data_Maybe.Nothing) {
                return z;
            };
            if (v1 instanceof Data_Maybe.Just) {
                return v(v1.value0)(z);
            };
            throw new Error("Failed pattern match at Data.Foldable line 128, column 3 - line 128, column 25: " + [ v.constructor.name, z.constructor.name, v1.constructor.name ]);
        };
    };
});
var foldableDual = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableDisj = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableConj = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldableAdditive = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var foldMapDefaultR = function (dictFoldable) {
    return function (dictMonoid) {
        return function (f) {
            return function (xs) {
                return foldr(dictFoldable)(function (x) {
                    return function (acc) {
                        return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(f(x))(acc);
                    };
                })(Data_Monoid.mempty(dictMonoid))(xs);
            };
        };
    };
};
var foldableArray = new Foldable(function (dictMonoid) {
    return foldMapDefaultR(foldableArray)(dictMonoid);
}, $foreign.foldlArray, $foreign.foldrArray);
var foldMapDefaultL = function (dictFoldable) {
    return function (dictMonoid) {
        return function (f) {
            return function (xs) {
                return foldl(dictFoldable)(function (acc) {
                    return function (x) {
                        return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(f(x))(acc);
                    };
                })(Data_Monoid.mempty(dictMonoid))(xs);
            };
        };
    };
};
var foldMap = function (dict) {
    return dict.foldMap;
};
var foldableFirst = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return foldMap(foldableMaybe)(dictMonoid)(f)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldl(foldableMaybe)(f)(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldr(foldableMaybe)(f)(z)(v);
        };
    };
});
var foldableLast = new Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return foldMap(foldableMaybe)(dictMonoid)(f)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldl(foldableMaybe)(f)(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return foldr(foldableMaybe)(f)(z)(v);
        };
    };
});
var foldlDefault = function (dictFoldable) {
    return function (c) {
        return function (u) {
            return function (xs) {
                return Data_Monoid_Endo.runEndo(Data_Monoid_Dual.runDual(foldMap(dictFoldable)(Data_Monoid_Dual.monoidDual(Data_Monoid_Endo.monoidEndo))(function ($165) {
                    return Data_Monoid_Dual.Dual(Data_Monoid_Endo.Endo(Data_Function.flip(c)($165)));
                })(xs)))(u);
            };
        };
    };
};
var foldrDefault = function (dictFoldable) {
    return function (c) {
        return function (u) {
            return function (xs) {
                return Data_Monoid_Endo.runEndo(foldMap(dictFoldable)(Data_Monoid_Endo.monoidEndo)(function ($166) {
                    return Data_Monoid_Endo.Endo(c($166));
                })(xs))(u);
            };
        };
    };
};
var fold = function (dictFoldable) {
    return function (dictMonoid) {
        return foldMap(dictFoldable)(dictMonoid)(Control_Category.id(Control_Category.categoryFn));
    };
};
var find = function (dictFoldable) {
    return function (p) {
        var go = function (v) {
            return function (v1) {
                if (v instanceof Data_Maybe.Nothing && p(v1)) {
                    return new Data_Maybe.Just(v1);
                };
                return v;
            };
        };
        return foldl(dictFoldable)(go)(Data_Maybe.Nothing.value);
    };
};
var any = function (dictFoldable) {
    return function (dictBooleanAlgebra) {
        return function (p) {
            return function ($167) {
                return Data_Monoid_Disj.runDisj(foldMap(dictFoldable)(Data_Monoid_Disj.monoidDisj(dictBooleanAlgebra["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]()))(function ($168) {
                    return Data_Monoid_Disj.Disj(p($168));
                })($167));
            };
        };
    };
};
var elem = function (dictFoldable) {
    return function (dictEq) {
        return function ($169) {
            return any(dictFoldable)(Data_BooleanAlgebra.booleanAlgebraBoolean)(Data_Eq.eq(dictEq)($169));
        };
    };
};
var notElem = function (dictFoldable) {
    return function (dictEq) {
        return function (x) {
            return function ($170) {
                return !elem(dictFoldable)(dictEq)(x)($170);
            };
        };
    };
};
var or = function (dictFoldable) {
    return function (dictBooleanAlgebra) {
        return any(dictFoldable)(dictBooleanAlgebra)(Control_Category.id(Control_Category.categoryFn));
    };
};
var all = function (dictFoldable) {
    return function (dictBooleanAlgebra) {
        return function (p) {
            return function ($171) {
                return Data_Monoid_Conj.runConj(foldMap(dictFoldable)(Data_Monoid_Conj.monoidConj(dictBooleanAlgebra["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]()))(function ($172) {
                    return Data_Monoid_Conj.Conj(p($172));
                })($171));
            };
        };
    };
};
var and = function (dictFoldable) {
    return function (dictBooleanAlgebra) {
        return all(dictFoldable)(dictBooleanAlgebra)(Control_Category.id(Control_Category.categoryFn));
    };
};
module.exports = {
    Foldable: Foldable, 
    all: all, 
    and: and, 
    any: any, 
    elem: elem, 
    find: find, 
    fold: fold, 
    foldMap: foldMap, 
    foldMapDefaultL: foldMapDefaultL, 
    foldMapDefaultR: foldMapDefaultR, 
    foldl: foldl, 
    foldlDefault: foldlDefault, 
    foldr: foldr, 
    foldrDefault: foldrDefault, 
    for_: for_, 
    intercalate: intercalate, 
    maximum: maximum, 
    maximumBy: maximumBy, 
    minimum: minimum, 
    minimumBy: minimumBy, 
    notElem: notElem, 
    oneOf: oneOf, 
    or: or, 
    product: product, 
    sequence_: sequence_, 
    sum: sum, 
    traverse_: traverse_, 
    foldableArray: foldableArray, 
    foldableMaybe: foldableMaybe, 
    foldableFirst: foldableFirst, 
    foldableLast: foldableLast, 
    foldableAdditive: foldableAdditive, 
    foldableDual: foldableDual, 
    foldableDisj: foldableDisj, 
    foldableConj: foldableConj, 
    foldableMultiplicative: foldableMultiplicative
};

},{"../Control.Alt":12,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Category":21,"../Control.Plus":65,"../Control.Semigroupoid":66,"../Data.BooleanAlgebra":74,"../Data.Eq":81,"../Data.Function":91,"../Data.HeytingAlgebra":96,"../Data.Maybe":104,"../Data.Maybe.First":102,"../Data.Maybe.Last":103,"../Data.Monoid":111,"../Data.Monoid.Additive":105,"../Data.Monoid.Conj":106,"../Data.Monoid.Disj":107,"../Data.Monoid.Dual":108,"../Data.Monoid.Endo":109,"../Data.Monoid.Multiplicative":110,"../Data.Ord":116,"../Data.Ordering":117,"../Data.Semigroup":121,"../Data.Semiring":123,"../Data.Unit":135,"./foreign":85}],87:[function(require,module,exports){
/* global exports */
"use strict";

// jshint maxparams: 3
exports.parseJSONImpl = function (left, right, str) {
  try {
    return right(JSON.parse(str));
  } catch (e) {
    return left(e.toString());
  }
};
// jshint maxparams: 1

exports.toForeign = function (value) {
  return value;
};

exports.unsafeFromForeign = function (value) {
  return value;
};

exports.typeOf = function (value) {
  return typeof value;
};

exports.tagOf = function (value) {
  return Object.prototype.toString.call(value).slice(8, -1);
};

exports.isNull = function (value) {
  return value === null;
};

exports.isUndefined = function (value) {
  return value === undefined;
};

exports.isArray = Array.isArray || function (value) {
  return Object.prototype.toString.call(value) === "[object Array]";
};

exports.writeObject = function (fields) {
  var record = {};
  for (var i = 0; i < fields.length; i++) {
    record[fields[i].key] = fields[i].value;
  }
  return record;
};

},{}],88:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Data_Either = require("../Data.Either");
var Data_Function_Uncurried = require("../Data.Function.Uncurried");
var Data_Int = require("../Data.Int");
var Data_Maybe = require("../Data.Maybe");
var Data_String = require("../Data.String");
var Data_Show = require("../Data.Show");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Eq = require("../Data.Eq");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Control_Applicative = require("../Control.Applicative");
var Data_Function = require("../Data.Function");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Prop = function (x) {
    return x;
};
var TypeMismatch = (function () {
    function TypeMismatch(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    TypeMismatch.create = function (value0) {
        return function (value1) {
            return new TypeMismatch(value0, value1);
        };
    };
    return TypeMismatch;
})();
var ErrorAtIndex = (function () {
    function ErrorAtIndex(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    ErrorAtIndex.create = function (value0) {
        return function (value1) {
            return new ErrorAtIndex(value0, value1);
        };
    };
    return ErrorAtIndex;
})();
var ErrorAtProperty = (function () {
    function ErrorAtProperty(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    ErrorAtProperty.create = function (value0) {
        return function (value1) {
            return new ErrorAtProperty(value0, value1);
        };
    };
    return ErrorAtProperty;
})();
var JSONError = (function () {
    function JSONError(value0) {
        this.value0 = value0;
    };
    JSONError.create = function (value0) {
        return new JSONError(value0);
    };
    return JSONError;
})();
var unsafeReadTagged = function (tag) {
    return function (value) {
        if ($foreign.tagOf(value) === tag) {
            return Control_Applicative.pure(Data_Either.applicativeEither)($foreign.unsafeFromForeign(value));
        };
        return new Data_Either.Left(new TypeMismatch(tag, $foreign.tagOf(value)));
    };
};
var showForeignError = new Data_Show.Show(function (v) {
    if (v instanceof TypeMismatch) {
        return "Type mismatch: expected " + (v.value0 + (", found " + v.value1));
    };
    if (v instanceof ErrorAtIndex) {
        return "Error at array index " + (Data_Show.show(Data_Show.showInt)(v.value0) + (": " + Data_Show.show(showForeignError)(v.value1)));
    };
    if (v instanceof ErrorAtProperty) {
        return "Error at property " + (Data_Show.show(Data_Show.showString)(v.value0) + (": " + Data_Show.show(showForeignError)(v.value1)));
    };
    if (v instanceof JSONError) {
        return "JSON error: " + v.value0;
    };
    throw new Error("Failed pattern match at Data.Foreign line 55, column 3 - line 55, column 87: " + [ v.constructor.name ]);
});
var readString = unsafeReadTagged("String");
var readNumber = unsafeReadTagged("Number");
var readInt = function (value) {
    var error = Data_Function.apply(Data_Either.Left.create)(new TypeMismatch("Int", $foreign.tagOf(value)));
    var fromNumber = function ($91) {
        return Data_Maybe.maybe(error)(Control_Applicative.pure(Data_Either.applicativeEither))(Data_Int.fromNumber($91));
    };
    return Data_Either.either(Data_Function["const"](error))(fromNumber)(readNumber(value));
};
var readChar = function (value) {
    var error = Data_Function.apply(Data_Either.Left.create)(new TypeMismatch("Char", $foreign.tagOf(value)));
    var fromString = function ($92) {
        return Data_Maybe.maybe(error)(Control_Applicative.pure(Data_Either.applicativeEither))(Data_String.toChar($92));
    };
    return Data_Either.either(Data_Function["const"](error))(fromString)(readString(value));
};
var readBoolean = unsafeReadTagged("Boolean");
var readArray = function (value) {
    if ($foreign.isArray(value)) {
        return Data_Function.apply(Control_Applicative.pure(Data_Either.applicativeEither))($foreign.unsafeFromForeign(value));
    };
    return new Data_Either.Left(new TypeMismatch("array", $foreign.tagOf(value)));
};
var parseJSON = function (json) {
    return $foreign.parseJSONImpl(function ($93) {
        return Data_Either.Left.create(JSONError.create($93));
    }, Data_Either.Right.create, json);
};
var eqForeignError = new Data_Eq.Eq(function (x) {
    return function (y) {
        if (x instanceof TypeMismatch && y instanceof TypeMismatch) {
            return x.value0 === y.value0 && x.value1 === y.value1;
        };
        if (x instanceof ErrorAtIndex && y instanceof ErrorAtIndex) {
            return x.value0 === y.value0 && Data_Eq.eq(eqForeignError)(x.value1)(y.value1);
        };
        if (x instanceof ErrorAtProperty && y instanceof ErrorAtProperty) {
            return x.value0 === y.value0 && Data_Eq.eq(eqForeignError)(x.value1)(y.value1);
        };
        if (x instanceof JSONError && y instanceof JSONError) {
            return x.value0 === y.value0;
        };
        return false;
    };
});
var ordForeignError = new Data_Ord.Ord(function () {
    return eqForeignError;
}, function (x) {
    return function (y) {
        if (x instanceof TypeMismatch && y instanceof TypeMismatch) {
            var $62 = Data_Ord.compare(Data_Ord.ordString)(x.value0)(y.value0);
            if ($62 instanceof Data_Ordering.LT) {
                return Data_Ordering.LT.value;
            };
            if ($62 instanceof Data_Ordering.GT) {
                return Data_Ordering.GT.value;
            };
            return Data_Ord.compare(Data_Ord.ordString)(x.value1)(y.value1);
        };
        if (x instanceof TypeMismatch) {
            return Data_Ordering.LT.value;
        };
        if (y instanceof TypeMismatch) {
            return Data_Ordering.GT.value;
        };
        if (x instanceof ErrorAtIndex && y instanceof ErrorAtIndex) {
            var $71 = Data_Ord.compare(Data_Ord.ordInt)(x.value0)(y.value0);
            if ($71 instanceof Data_Ordering.LT) {
                return Data_Ordering.LT.value;
            };
            if ($71 instanceof Data_Ordering.GT) {
                return Data_Ordering.GT.value;
            };
            return Data_Ord.compare(ordForeignError)(x.value1)(y.value1);
        };
        if (x instanceof ErrorAtIndex) {
            return Data_Ordering.LT.value;
        };
        if (y instanceof ErrorAtIndex) {
            return Data_Ordering.GT.value;
        };
        if (x instanceof ErrorAtProperty && y instanceof ErrorAtProperty) {
            var $80 = Data_Ord.compare(Data_Ord.ordString)(x.value0)(y.value0);
            if ($80 instanceof Data_Ordering.LT) {
                return Data_Ordering.LT.value;
            };
            if ($80 instanceof Data_Ordering.GT) {
                return Data_Ordering.GT.value;
            };
            return Data_Ord.compare(ordForeignError)(x.value1)(y.value1);
        };
        if (x instanceof ErrorAtProperty) {
            return Data_Ordering.LT.value;
        };
        if (y instanceof ErrorAtProperty) {
            return Data_Ordering.GT.value;
        };
        if (x instanceof JSONError && y instanceof JSONError) {
            return Data_Ord.compare(Data_Ord.ordString)(x.value0)(y.value0);
        };
        throw new Error("Failed pattern match: " + [ x.constructor.name, y.constructor.name ]);
    };
});
module.exports = {
    TypeMismatch: TypeMismatch, 
    ErrorAtIndex: ErrorAtIndex, 
    ErrorAtProperty: ErrorAtProperty, 
    JSONError: JSONError, 
    Prop: Prop, 
    parseJSON: parseJSON, 
    readArray: readArray, 
    readBoolean: readBoolean, 
    readChar: readChar, 
    readInt: readInt, 
    readNumber: readNumber, 
    readString: readString, 
    unsafeReadTagged: unsafeReadTagged, 
    showForeignError: showForeignError, 
    eqForeignError: eqForeignError, 
    ordForeignError: ordForeignError, 
    isArray: $foreign.isArray, 
    isNull: $foreign.isNull, 
    isUndefined: $foreign.isUndefined, 
    tagOf: $foreign.tagOf, 
    toForeign: $foreign.toForeign, 
    typeOf: $foreign.typeOf, 
    unsafeFromForeign: $foreign.unsafeFromForeign, 
    writeObject: $foreign.writeObject
};

},{"../Control.Applicative":14,"../Control.Semigroupoid":66,"../Data.Either":79,"../Data.Eq":81,"../Data.Function":91,"../Data.Function.Uncurried":90,"../Data.HeytingAlgebra":96,"../Data.Int":101,"../Data.Maybe":104,"../Data.Ord":116,"../Data.Ordering":117,"../Data.Semigroup":121,"../Data.Show":125,"../Data.String":129,"../Prelude":144,"./foreign":87}],89:[function(require,module,exports){
"use strict";

// module Data.Function.Uncurried

exports.mkFn0 = function (fn) {
  return function () {
    return fn({});
  };
};

exports.mkFn1 = function (fn) {
  return function (a) {
    return fn(a);
  };
};

exports.mkFn2 = function (fn) {
  /* jshint maxparams: 2 */
  return function (a, b) {
    return fn(a)(b);
  };
};

exports.mkFn3 = function (fn) {
  /* jshint maxparams: 3 */
  return function (a, b, c) {
    return fn(a)(b)(c);
  };
};

exports.mkFn4 = function (fn) {
  /* jshint maxparams: 4 */
  return function (a, b, c, d) {
    return fn(a)(b)(c)(d);
  };
};

exports.mkFn5 = function (fn) {
  /* jshint maxparams: 5 */
  return function (a, b, c, d, e) {
    return fn(a)(b)(c)(d)(e);
  };
};

exports.mkFn6 = function (fn) {
  /* jshint maxparams: 6 */
  return function (a, b, c, d, e, f) {
    return fn(a)(b)(c)(d)(e)(f);
  };
};

exports.mkFn7 = function (fn) {
  /* jshint maxparams: 7 */
  return function (a, b, c, d, e, f, g) {
    return fn(a)(b)(c)(d)(e)(f)(g);
  };
};

exports.mkFn8 = function (fn) {
  /* jshint maxparams: 8 */
  return function (a, b, c, d, e, f, g, h) {
    return fn(a)(b)(c)(d)(e)(f)(g)(h);
  };
};

exports.mkFn9 = function (fn) {
  /* jshint maxparams: 9 */
  return function (a, b, c, d, e, f, g, h, i) {
    return fn(a)(b)(c)(d)(e)(f)(g)(h)(i);
  };
};

exports.mkFn10 = function (fn) {
  /* jshint maxparams: 10 */
  return function (a, b, c, d, e, f, g, h, i, j) {
    return fn(a)(b)(c)(d)(e)(f)(g)(h)(i)(j);
  };
};

exports.runFn0 = function (fn) {
  return fn();
};

exports.runFn1 = function (fn) {
  return function (a) {
    return fn(a);
  };
};

exports.runFn2 = function (fn) {
  return function (a) {
    return function (b) {
      return fn(a, b);
    };
  };
};

exports.runFn3 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return fn(a, b, c);
      };
    };
  };
};

exports.runFn4 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return fn(a, b, c, d);
        };
      };
    };
  };
};

exports.runFn5 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return fn(a, b, c, d, e);
          };
        };
      };
    };
  };
};

exports.runFn6 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return fn(a, b, c, d, e, f);
            };
          };
        };
      };
    };
  };
};

exports.runFn7 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return fn(a, b, c, d, e, f, g);
              };
            };
          };
        };
      };
    };
  };
};

exports.runFn8 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return function (h) {
                  return fn(a, b, c, d, e, f, g, h);
                };
              };
            };
          };
        };
      };
    };
  };
};

exports.runFn9 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return function (h) {
                  return function (i) {
                    return fn(a, b, c, d, e, f, g, h, i);
                  };
                };
              };
            };
          };
        };
      };
    };
  };
};

exports.runFn10 = function (fn) {
  return function (a) {
    return function (b) {
      return function (c) {
        return function (d) {
          return function (e) {
            return function (f) {
              return function (g) {
                return function (h) {
                  return function (i) {
                    return function (j) {
                      return fn(a, b, c, d, e, f, g, h, i, j);
                    };
                  };
                };
              };
            };
          };
        };
      };
    };
  };
};

},{}],90:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
module.exports = {
    mkFn0: $foreign.mkFn0, 
    mkFn1: $foreign.mkFn1, 
    mkFn10: $foreign.mkFn10, 
    mkFn2: $foreign.mkFn2, 
    mkFn3: $foreign.mkFn3, 
    mkFn4: $foreign.mkFn4, 
    mkFn5: $foreign.mkFn5, 
    mkFn6: $foreign.mkFn6, 
    mkFn7: $foreign.mkFn7, 
    mkFn8: $foreign.mkFn8, 
    mkFn9: $foreign.mkFn9, 
    runFn0: $foreign.runFn0, 
    runFn1: $foreign.runFn1, 
    runFn10: $foreign.runFn10, 
    runFn2: $foreign.runFn2, 
    runFn3: $foreign.runFn3, 
    runFn4: $foreign.runFn4, 
    runFn5: $foreign.runFn5, 
    runFn6: $foreign.runFn6, 
    runFn7: $foreign.runFn7, 
    runFn8: $foreign.runFn8, 
    runFn9: $foreign.runFn9
};

},{"../Data.Unit":135,"./foreign":89}],91:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Category = require("../Control.Category");
var on = function (f) {
    return function (g) {
        return function (x) {
            return function (y) {
                return f(g(x))(g(y));
            };
        };
    };
};
var flip = function (f) {
    return function (b) {
        return function (a) {
            return f(a)(b);
        };
    };
};
var $$const = function (a) {
    return function (v) {
        return a;
    };
};
var applyFlipped = function (x) {
    return function (f) {
        return f(x);
    };
};
var apply = function (f) {
    return function (x) {
        return f(x);
    };
};
module.exports = {
    apply: apply, 
    applyFlipped: applyFlipped, 
    "const": $$const, 
    flip: flip, 
    on: on
};

},{"../Control.Category":21}],92:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Invariant = function (imap) {
    this.imap = imap;
};
var imapF = function (dictFunctor) {
    return function ($1) {
        return Data_Function["const"](Data_Functor.map(dictFunctor)($1));
    };
};
var invariantArray = new Invariant(imapF(Data_Functor.functorArray));
var invariantFn = new Invariant(imapF(Data_Functor.functorFn));
var imap = function (dict) {
    return dict.imap;
};
module.exports = {
    Invariant: Invariant, 
    imap: imap, 
    imapF: imapF, 
    invariantFn: invariantFn, 
    invariantArray: invariantArray
};

},{"../Control.Semigroupoid":66,"../Data.Function":91,"../Data.Functor":94}],93:[function(require,module,exports){
"use strict";

// module Data.Functor

exports.arrayMap = function (f) {
  return function (arr) {
    var l = arr.length;
    var result = new Array(l);
    for (var i = 0; i < l; i++) {
      result[i] = f(arr[i]);
    }
    return result;
  };
};

},{}],94:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Function = require("../Data.Function");
var Data_Unit = require("../Data.Unit");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Functor = function (map) {
    this.map = map;
};
var map = function (dict) {
    return dict.map;
};
var mapFlipped = function (dictFunctor) {
    return function (fa) {
        return function (f) {
            return map(dictFunctor)(f)(fa);
        };
    };
};
var $$void = function (dictFunctor) {
    return map(dictFunctor)(Data_Function["const"](Data_Unit.unit));
};
var voidLeft = function (dictFunctor) {
    return function (f) {
        return function (x) {
            return map(dictFunctor)(Data_Function["const"](x))(f);
        };
    };
};
var voidRight = function (dictFunctor) {
    return function (x) {
        return map(dictFunctor)(Data_Function["const"](x));
    };
};
var functorFn = new Functor(Control_Semigroupoid.compose(Control_Semigroupoid.semigroupoidFn));
var functorArray = new Functor($foreign.arrayMap);
var flap = function (dictFunctor) {
    return function (ff) {
        return function (x) {
            return map(dictFunctor)(function (f) {
                return f(x);
            })(ff);
        };
    };
};
module.exports = {
    Functor: Functor, 
    flap: flap, 
    map: map, 
    mapFlipped: mapFlipped, 
    "void": $$void, 
    voidLeft: voidLeft, 
    voidRight: voidRight, 
    functorFn: functorFn, 
    functorArray: functorArray
};

},{"../Control.Semigroupoid":66,"../Data.Function":91,"../Data.Unit":135,"./foreign":93}],95:[function(require,module,exports){
"use strict";

// module Data.HeytingAlgebra

exports.boolConj = function (b1) {
  return function (b2) {
    return b1 && b2;
  };
};

exports.boolDisj = function (b1) {
  return function (b2) {
    return b1 || b2;
  };
};

exports.boolNot = function (b) {
  return !b;
};

},{}],96:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var HeytingAlgebra = function (conj, disj, ff, implies, not, tt) {
    this.conj = conj;
    this.disj = disj;
    this.ff = ff;
    this.implies = implies;
    this.not = not;
    this.tt = tt;
};
var tt = function (dict) {
    return dict.tt;
};
var not = function (dict) {
    return dict.not;
};
var implies = function (dict) {
    return dict.implies;
};
var heytingAlgebraUnit = new HeytingAlgebra(function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, Data_Unit.unit, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, function (v) {
    return Data_Unit.unit;
}, Data_Unit.unit);
var ff = function (dict) {
    return dict.ff;
};
var disj = function (dict) {
    return dict.disj;
};
var heytingAlgebraBoolean = new HeytingAlgebra($foreign.boolConj, $foreign.boolDisj, false, function (a) {
    return function (b) {
        return disj(heytingAlgebraBoolean)(not(heytingAlgebraBoolean)(a))(b);
    };
}, $foreign.boolNot, true);
var conj = function (dict) {
    return dict.conj;
};
var heytingAlgebraFunction = function (dictHeytingAlgebra) {
    return new HeytingAlgebra(function (f) {
        return function (g) {
            return function (a) {
                return conj(dictHeytingAlgebra)(f(a))(g(a));
            };
        };
    }, function (f) {
        return function (g) {
            return function (a) {
                return disj(dictHeytingAlgebra)(f(a))(g(a));
            };
        };
    }, function (v) {
        return ff(dictHeytingAlgebra);
    }, function (f) {
        return function (g) {
            return function (a) {
                return implies(dictHeytingAlgebra)(f(a))(g(a));
            };
        };
    }, function (f) {
        return function (a) {
            return not(dictHeytingAlgebra)(f(a));
        };
    }, function (v) {
        return tt(dictHeytingAlgebra);
    });
};
module.exports = {
    HeytingAlgebra: HeytingAlgebra, 
    conj: conj, 
    disj: disj, 
    ff: ff, 
    implies: implies, 
    not: not, 
    tt: tt, 
    heytingAlgebraBoolean: heytingAlgebraBoolean, 
    heytingAlgebraUnit: heytingAlgebraUnit, 
    heytingAlgebraFunction: heytingAlgebraFunction
};

},{"../Data.Unit":135,"./foreign":95}],97:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Bounded = require("../Data.Bounded");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_Eq = require("../Data.Eq");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Field = require("../Data.Field");
var Data_Foldable = require("../Data.Foldable");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Data_Traversable = require("../Data.Traversable");
var Identity = function (x) {
    return x;
};
var showIdentity = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Identity " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semiringIdentity = function (dictSemiring) {
    return new Data_Semiring.Semiring(function (v) {
        return function (v1) {
            return Data_Semiring.add(dictSemiring)(v)(v1);
        };
    }, function (v) {
        return function (v1) {
            return Data_Semiring.mul(dictSemiring)(v)(v1);
        };
    }, Data_Semiring.one(dictSemiring), Data_Semiring.zero(dictSemiring));
};
var semigroupIdenity = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_Semigroup.append(dictSemigroup)(v)(v1);
        };
    });
};
var runIdentity = function (v) {
    return v;
};
var ringIdentity = function (dictRing) {
    return new Data_Ring.Ring(function () {
        return semiringIdentity(dictRing["__superclass_Data.Semiring.Semiring_0"]());
    }, function (v) {
        return function (v1) {
            return Data_Ring.sub(dictRing)(v)(v1);
        };
    });
};
var monoidIdentity = function (dictMonoid) {
    return new Data_Monoid.Monoid(function () {
        return semigroupIdenity(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    }, Data_Monoid.mempty(dictMonoid));
};
var heytingAlgebraIdentity = function (dictHeytingAlgebra) {
    return new Data_HeytingAlgebra.HeytingAlgebra(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v)(v1);
        };
    }, function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v)(v1);
        };
    }, Data_HeytingAlgebra.ff(dictHeytingAlgebra), function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.implies(dictHeytingAlgebra)(v)(v1);
        };
    }, function (v) {
        return Data_HeytingAlgebra.not(dictHeytingAlgebra)(v);
    }, Data_HeytingAlgebra.tt(dictHeytingAlgebra));
};
var functorIdentity = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var invariantIdentity = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorIdentity));
var foldableIdentity = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v)(z);
        };
    };
});
var traversableIdentity = new Data_Traversable.Traversable(function () {
    return foldableIdentity;
}, function () {
    return functorIdentity;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Identity)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Identity)(f(v));
        };
    };
});
var extendIdentity = new Control_Extend.Extend(function () {
    return functorIdentity;
}, function (f) {
    return function (m) {
        return f(m);
    };
});
var eqIdentity = function (dictEq) {
    return new Data_Eq.Eq(function (v) {
        return function (v1) {
            return Data_Eq.eq(dictEq)(v)(v1);
        };
    });
};
var ordIdentity = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqIdentity(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (v) {
        return function (v1) {
            return Data_Ord.compare(dictOrd)(v)(v1);
        };
    });
};
var comonadIdentity = new Control_Comonad.Comonad(function () {
    return extendIdentity;
}, function (v) {
    return v;
});
var commutativeRingIdentity = function (dictCommutativeRing) {
    return new Data_CommutativeRing.CommutativeRing(function () {
        return ringIdentity(dictCommutativeRing["__superclass_Data.Ring.Ring_0"]());
    });
};
var euclideanRingIdentity = function (dictEuclideanRing) {
    return new Data_EuclideanRing.EuclideanRing(function () {
        return commutativeRingIdentity(dictEuclideanRing["__superclass_Data.CommutativeRing.CommutativeRing_0"]());
    }, function (v) {
        return Data_EuclideanRing.degree(dictEuclideanRing)(v);
    }, function (v) {
        return function (v1) {
            return Data_EuclideanRing.div(dictEuclideanRing)(v)(v1);
        };
    }, function (v) {
        return function (v1) {
            return Data_EuclideanRing.mod(dictEuclideanRing)(v)(v1);
        };
    });
};
var fieldIdentity = function (dictField) {
    return new Data_Field.Field(function () {
        return euclideanRingIdentity(dictField["__superclass_Data.EuclideanRing.EuclideanRing_0"]());
    });
};
var boundedIdentity = function (dictBounded) {
    return new Data_Bounded.Bounded(function () {
        return ordIdentity(dictBounded["__superclass_Data.Ord.Ord_0"]());
    }, Data_Bounded.bottom(dictBounded), Data_Bounded.top(dictBounded));
};
var booleanAlgebraIdentity = function (dictBooleanAlgebra) {
    return new Data_BooleanAlgebra.BooleanAlgebra(function () {
        return heytingAlgebraIdentity(dictBooleanAlgebra["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]());
    });
};
var applyIdentity = new Control_Apply.Apply(function () {
    return functorIdentity;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindIdentity = new Control_Bind.Bind(function () {
    return applyIdentity;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeIdentity = new Control_Applicative.Applicative(function () {
    return applyIdentity;
}, Identity);
var monadIdentity = new Control_Monad.Monad(function () {
    return applicativeIdentity;
}, function () {
    return bindIdentity;
});
var altIdentity = new Control_Alt.Alt(function () {
    return functorIdentity;
}, function (x) {
    return function (v) {
        return x;
    };
});
module.exports = {
    Identity: Identity, 
    runIdentity: runIdentity, 
    eqIdentity: eqIdentity, 
    ordIdentity: ordIdentity, 
    boundedIdentity: boundedIdentity, 
    heytingAlgebraIdentity: heytingAlgebraIdentity, 
    booleanAlgebraIdentity: booleanAlgebraIdentity, 
    semigroupIdenity: semigroupIdenity, 
    monoidIdentity: monoidIdentity, 
    semiringIdentity: semiringIdentity, 
    euclideanRingIdentity: euclideanRingIdentity, 
    ringIdentity: ringIdentity, 
    commutativeRingIdentity: commutativeRingIdentity, 
    fieldIdentity: fieldIdentity, 
    showIdentity: showIdentity, 
    functorIdentity: functorIdentity, 
    invariantIdentity: invariantIdentity, 
    altIdentity: altIdentity, 
    applyIdentity: applyIdentity, 
    applicativeIdentity: applicativeIdentity, 
    bindIdentity: bindIdentity, 
    monadIdentity: monadIdentity, 
    extendIdentity: extendIdentity, 
    comonadIdentity: comonadIdentity, 
    foldableIdentity: foldableIdentity, 
    traversableIdentity: traversableIdentity
};

},{"../Control.Alt":12,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Data.BooleanAlgebra":74,"../Data.Bounded":76,"../Data.CommutativeRing":77,"../Data.Eq":81,"../Data.EuclideanRing":83,"../Data.Field":84,"../Data.Foldable":86,"../Data.Functor":94,"../Data.Functor.Invariant":92,"../Data.HeytingAlgebra":96,"../Data.Monoid":111,"../Data.Ord":116,"../Data.Ring":119,"../Data.Semigroup":121,"../Data.Semiring":123,"../Data.Show":125,"../Data.Traversable":131}],98:[function(require,module,exports){
"use strict";

// module Data.Int.Bits

exports.and = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 & n2;
  };
};

exports.or = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 | n2;
  };
};

exports.xor = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 ^ n2;
  };
};

exports.shl = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 << n2;
  };
};

exports.shr = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 >> n2;
  };
};

exports.zshr = function (n1) {
  return function (n2) {
    /* jshint bitwise: false */
    return n1 >>> n2;
  };
};

exports.complement = function (n) {
  /* jshint bitwise: false */
  return ~n;
};

},{}],99:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
module.exports = {
    and: $foreign.and, 
    complement: $foreign.complement, 
    or: $foreign.or, 
    shl: $foreign.shl, 
    shr: $foreign.shr, 
    xor: $foreign.xor, 
    zshr: $foreign.zshr
};

},{"./foreign":98}],100:[function(require,module,exports){
"use strict";

// module Data.Int

exports.fromNumberImpl = function (just) {
  return function (nothing) {
    return function (n) {
      /* jshint bitwise: false */
      return (n | 0) === n ? just(n) : nothing;
    };
  };
};

exports.toNumber = function (n) {
  return n;
};

exports.fromStringAsImpl = function (just) {
  return function (nothing) {
    return function (radix) {
      var digits;
      if (radix < 11) {
        digits = "[0-" + (radix - 1).toString() + "]";
      } else if (radix === 11) {
        digits = "[0-9a]";
      } else {
        digits = "[0-9a-" + String.fromCharCode(86 + radix) + "]";
      }
      var pattern = new RegExp("^[\\+\\-]?" + digits + "+$", "i");

      return function (s) {
        /* jshint bitwise: false */
        if (pattern.test(s)) {
          var i = parseInt(s, radix);
          return (i | 0) === i ? just(i) : nothing;
        } else {
          return nothing;
        }
      };
    };
  };
};

exports.toStringAs = function (radix) {
  return function (i) {
    return i.toString(radix);
  };
};

},{}],101:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Boolean = require("../Data.Boolean");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_Int_Bits = require("../Data.Int.Bits");
var Data_Maybe = require("../Data.Maybe");
var Data_Ord = require("../Data.Ord");
var $$Math = require("../Math");
var Partial_Unsafe = require("../Partial.Unsafe");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Radix = function (x) {
    return x;
};
var radix = function (n) {
    if (n >= 2 && n <= 36) {
        return new Data_Maybe.Just(n);
    };
    if (Data_Boolean.otherwise) {
        return Data_Maybe.Nothing.value;
    };
    throw new Error("Failed pattern match at Data.Int line 124, column 1 - line 125, column 38: " + [ n.constructor.name ]);
};
var odd = function (x) {
    return Data_Int_Bits.and(x)(1) !== 0;
};
var octal = 8;
var hexadecimal = 16;
var fromStringAs = $foreign.fromStringAsImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var fromString = fromStringAs(10);
var fromNumber = $foreign.fromNumberImpl(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var unsafeClamp = function (x) {
    if (x >= $foreign.toNumber(Data_Bounded.top(Data_Bounded.boundedInt))) {
        return Data_Bounded.top(Data_Bounded.boundedInt);
    };
    if (x <= $foreign.toNumber(Data_Bounded.bottom(Data_Bounded.boundedInt))) {
        return Data_Bounded.bottom(Data_Bounded.boundedInt);
    };
    if (Data_Boolean.otherwise) {
        return Partial_Unsafe.unsafePartial(function (dictPartial) {
            return Data_Maybe.fromJust(dictPartial)(fromNumber(x));
        });
    };
    throw new Error("Failed pattern match at Data.Int line 65, column 1 - line 68, column 56: " + [ x.constructor.name ]);
};
var round = function ($3) {
    return unsafeClamp($$Math.round($3));
};
var floor = function ($4) {
    return unsafeClamp($$Math.floor($4));
};
var even = function (x) {
    return Data_Int_Bits.and(x)(1) === 0;
};
var decimal = 10;
var ceil = function ($5) {
    return unsafeClamp($$Math.ceil($5));
};
var binary = 2;
var base36 = 36;
module.exports = {
    base36: base36, 
    binary: binary, 
    ceil: ceil, 
    decimal: decimal, 
    even: even, 
    floor: floor, 
    fromNumber: fromNumber, 
    fromString: fromString, 
    fromStringAs: fromStringAs, 
    hexadecimal: hexadecimal, 
    octal: octal, 
    odd: odd, 
    radix: radix, 
    round: round, 
    toNumber: $foreign.toNumber, 
    toStringAs: $foreign.toStringAs
};

},{"../Control.Semigroupoid":66,"../Data.Boolean":73,"../Data.BooleanAlgebra":74,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Function":91,"../Data.HeytingAlgebra":96,"../Data.Int.Bits":99,"../Data.Maybe":104,"../Data.Ord":116,"../Math":139,"../Partial.Unsafe":141,"./foreign":100}],102:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var First = function (x) {
    return x;
};
var showFirst = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "First (" + (Data_Show.show(Data_Maybe.showMaybe(dictShow))(v) + ")");
    });
};
var semigroupFirst = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        if (v instanceof Data_Maybe.Just) {
            return v;
        };
        return v1;
    };
});
var runFirst = function (v) {
    return v;
};
var monoidFirst = new Data_Monoid.Monoid(function () {
    return semigroupFirst;
}, Data_Maybe.Nothing.value);
var functorFirst = new Data_Functor.Functor(function (f) {
    return function (v) {
        return Data_Functor.map(Data_Maybe.functorMaybe)(f)(v);
    };
});
var invariantFirst = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorFirst));
var extendFirst = new Control_Extend.Extend(function () {
    return functorFirst;
}, function (f) {
    return function (v) {
        return Control_Extend.extend(Data_Maybe.extendMaybe)(function ($34) {
            return f(First($34));
        })(v);
    };
});
var eqFirst = function (dictEq) {
    return new Data_Eq.Eq(function (v) {
        return function (v1) {
            return Data_Eq.eq(Data_Maybe.eqMaybe(dictEq))(v)(v1);
        };
    });
};
var ordFirst = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqFirst(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (v) {
        return function (v1) {
            return Data_Ord.compare(Data_Maybe.ordMaybe(dictOrd))(v)(v1);
        };
    });
};
var boundedFirst = function (dictBounded) {
    return new Data_Bounded.Bounded(function () {
        return ordFirst(dictBounded["__superclass_Data.Ord.Ord_0"]());
    }, Data_Bounded.bottom(Data_Maybe.boundedMaybe(dictBounded)), Data_Bounded.top(Data_Maybe.boundedMaybe(dictBounded)));
};
var applyFirst = new Control_Apply.Apply(function () {
    return functorFirst;
}, function (v) {
    return function (v1) {
        return Control_Apply.apply(Data_Maybe.applyMaybe)(v)(v1);
    };
});
var bindFirst = new Control_Bind.Bind(function () {
    return applyFirst;
}, function (v) {
    return function (f) {
        return Control_Bind.bind(Data_Maybe.bindMaybe)(v)(function ($35) {
            return runFirst(f($35));
        });
    };
});
var applicativeFirst = new Control_Applicative.Applicative(function () {
    return applyFirst;
}, function ($36) {
    return First(Control_Applicative.pure(Data_Maybe.applicativeMaybe)($36));
});
var monadFirst = new Control_Monad.Monad(function () {
    return applicativeFirst;
}, function () {
    return bindFirst;
});
module.exports = {
    First: First, 
    runFirst: runFirst, 
    eqFirst: eqFirst, 
    ordFirst: ordFirst, 
    boundedFirst: boundedFirst, 
    functorFirst: functorFirst, 
    invariantFirst: invariantFirst, 
    applyFirst: applyFirst, 
    applicativeFirst: applicativeFirst, 
    bindFirst: bindFirst, 
    monadFirst: monadFirst, 
    extendFirst: extendFirst, 
    showFirst: showFirst, 
    semigroupFirst: semigroupFirst, 
    monoidFirst: monoidFirst
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Extend":25,"../Control.Monad":61,"../Control.Semigroupoid":66,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Function":91,"../Data.Functor":94,"../Data.Functor.Invariant":92,"../Data.Maybe":104,"../Data.Monoid":111,"../Data.Ord":116,"../Data.Semigroup":121,"../Data.Show":125}],103:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Maybe = require("../Data.Maybe");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Last = function (x) {
    return x;
};
var showLast = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Last " + (Data_Show.show(Data_Maybe.showMaybe(dictShow))(v) + ")");
    });
};
var semigroupLast = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        if (v1 instanceof Data_Maybe.Just) {
            return v1;
        };
        if (v1 instanceof Data_Maybe.Nothing) {
            return v;
        };
        throw new Error("Failed pattern match at Data.Maybe.Last line 67, column 3 - line 67, column 39: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var runLast = function (v) {
    return v;
};
var monoidLast = new Data_Monoid.Monoid(function () {
    return semigroupLast;
}, Data_Maybe.Nothing.value);
var functorLast = new Data_Functor.Functor(function (f) {
    return function (v) {
        return Data_Functor.map(Data_Maybe.functorMaybe)(f)(v);
    };
});
var invariantLast = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorLast));
var extendLast = new Control_Extend.Extend(function () {
    return functorLast;
}, function (f) {
    return function (v) {
        return Control_Extend.extend(Data_Maybe.extendMaybe)(function ($34) {
            return f(Last($34));
        })(v);
    };
});
var eqLast = function (dictEq) {
    return new Data_Eq.Eq(function (v) {
        return function (v1) {
            return Data_Eq.eq(Data_Maybe.eqMaybe(dictEq))(v)(v1);
        };
    });
};
var ordLast = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqLast(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (v) {
        return function (v1) {
            return Data_Ord.compare(Data_Maybe.ordMaybe(dictOrd))(v)(v1);
        };
    });
};
var boundedLast = function (dictBounded) {
    return new Data_Bounded.Bounded(function () {
        return ordLast(dictBounded["__superclass_Data.Ord.Ord_0"]());
    }, Data_Bounded.bottom(Data_Maybe.boundedMaybe(dictBounded)), Data_Bounded.top(Data_Maybe.boundedMaybe(dictBounded)));
};
var applyLast = new Control_Apply.Apply(function () {
    return functorLast;
}, function (v) {
    return function (v1) {
        return Control_Apply.apply(Data_Maybe.applyMaybe)(v)(v1);
    };
});
var bindLast = new Control_Bind.Bind(function () {
    return applyLast;
}, function (v) {
    return function (f) {
        return Control_Bind.bind(Data_Maybe.bindMaybe)(v)(function ($35) {
            return runLast(f($35));
        });
    };
});
var applicativeLast = new Control_Applicative.Applicative(function () {
    return applyLast;
}, function ($36) {
    return Last(Control_Applicative.pure(Data_Maybe.applicativeMaybe)($36));
});
var monadLast = new Control_Monad.Monad(function () {
    return applicativeLast;
}, function () {
    return bindLast;
});
module.exports = {
    Last: Last, 
    runLast: runLast, 
    eqLast: eqLast, 
    ordLast: ordLast, 
    boundedLast: boundedLast, 
    functorLast: functorLast, 
    invariantLast: invariantLast, 
    applyLast: applyLast, 
    applicativeLast: applicativeLast, 
    bindLast: bindLast, 
    monadLast: monadLast, 
    extendLast: extendLast, 
    showLast: showLast, 
    semigroupLast: semigroupLast, 
    monoidLast: monoidLast
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Extend":25,"../Control.Monad":61,"../Control.Semigroupoid":66,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Function":91,"../Data.Functor":94,"../Data.Functor.Invariant":92,"../Data.Maybe":104,"../Data.Monoid":111,"../Data.Ord":116,"../Data.Semigroup":121,"../Data.Show":125}],104:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Alt = require("../Control.Alt");
var Control_Alternative = require("../Control.Alternative");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Control_MonadZero = require("../Control.MonadZero");
var Control_Plus = require("../Control.Plus");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Data_Unit = require("../Data.Unit");
var Control_Category = require("../Control.Category");
var Just = (function () {
    function Just(value0) {
        this.value0 = value0;
    };
    Just.create = function (value0) {
        return new Just(value0);
    };
    return Just;
})();
var Nothing = (function () {
    function Nothing() {

    };
    Nothing.value = new Nothing();
    return Nothing;
})();
var showMaybe = function (dictShow) {
    return new Data_Show.Show(function (v) {
        if (v instanceof Just) {
            return "(Just " + (Data_Show.show(dictShow)(v.value0) + ")");
        };
        if (v instanceof Nothing) {
            return "Nothing";
        };
        throw new Error("Failed pattern match at Data.Maybe line 220, column 3 - line 221, column 3: " + [ v.constructor.name ]);
    });
};
var semigroupMaybe = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            if (v instanceof Nothing) {
                return v1;
            };
            if (v1 instanceof Nothing) {
                return v;
            };
            if (v instanceof Just && v1 instanceof Just) {
                return new Just(Data_Semigroup.append(dictSemigroup)(v.value0)(v1.value0));
            };
            throw new Error("Failed pattern match at Data.Maybe line 186, column 3 - line 186, column 23: " + [ v.constructor.name, v1.constructor.name ]);
        };
    });
};
var monoidMaybe = function (dictSemigroup) {
    return new Data_Monoid.Monoid(function () {
        return semigroupMaybe(dictSemigroup);
    }, Nothing.value);
};
var maybe$prime = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Nothing) {
                return v(Data_Unit.unit);
            };
            if (v2 instanceof Just) {
                return v1(v2.value0);
            };
            throw new Error("Failed pattern match at Data.Maybe line 245, column 1 - line 245, column 28: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
};
var maybe = function (v) {
    return function (v1) {
        return function (v2) {
            if (v2 instanceof Nothing) {
                return v;
            };
            if (v2 instanceof Just) {
                return v1(v2.value0);
            };
            throw new Error("Failed pattern match at Data.Maybe line 232, column 1 - line 232, column 22: " + [ v.constructor.name, v1.constructor.name, v2.constructor.name ]);
        };
    };
};
var isNothing = maybe(true)(Data_Function["const"](false));
var isJust = maybe(false)(Data_Function["const"](true));
var functorMaybe = new Data_Functor.Functor(function (v) {
    return function (v1) {
        if (v1 instanceof Just) {
            return new Just(v(v1.value0));
        };
        return Nothing.value;
    };
});
var invariantMaybe = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorMaybe));
var fromMaybe$prime = function (a) {
    return maybe$prime(a)(Control_Category.id(Control_Category.categoryFn));
};
var fromMaybe = function (a) {
    return maybe(a)(Control_Category.id(Control_Category.categoryFn));
};
var fromJust = function (dictPartial) {
    return function (v) {
        var __unused = function (dictPartial1) {
            return function ($dollar29) {
                return $dollar29;
            };
        };
        return __unused(dictPartial)((function () {
            if (v instanceof Just) {
                return v.value0;
            };
            throw new Error("Failed pattern match at Data.Maybe line 283, column 1 - line 283, column 21: " + [ v.constructor.name ]);
        })());
    };
};
var extendMaybe = new Control_Extend.Extend(function () {
    return functorMaybe;
}, function (v) {
    return function (v1) {
        if (v1 instanceof Nothing) {
            return Nothing.value;
        };
        return new Just(v(v1));
    };
});
var eqMaybe = function (dictEq) {
    return new Data_Eq.Eq(function (v) {
        return function (v1) {
            if (v instanceof Nothing && v1 instanceof Nothing) {
                return true;
            };
            if (v instanceof Just && v1 instanceof Just) {
                return Data_Eq.eq(dictEq)(v.value0)(v1.value0);
            };
            return false;
        };
    });
};
var ordMaybe = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqMaybe(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (v) {
        return function (v1) {
            if (v instanceof Just && v1 instanceof Just) {
                return Data_Ord.compare(dictOrd)(v.value0)(v1.value0);
            };
            if (v instanceof Nothing && v1 instanceof Nothing) {
                return Data_Ordering.EQ.value;
            };
            if (v instanceof Nothing) {
                return Data_Ordering.LT.value;
            };
            if (v1 instanceof Nothing) {
                return Data_Ordering.GT.value;
            };
            throw new Error("Failed pattern match at Data.Maybe line 207, column 3 - line 207, column 42: " + [ v.constructor.name, v1.constructor.name ]);
        };
    });
};
var boundedMaybe = function (dictBounded) {
    return new Data_Bounded.Bounded(function () {
        return ordMaybe(dictBounded["__superclass_Data.Ord.Ord_0"]());
    }, Nothing.value, new Just(Data_Bounded.top(dictBounded)));
};
var applyMaybe = new Control_Apply.Apply(function () {
    return functorMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Just) {
            return Data_Functor.map(functorMaybe)(v.value0)(v1);
        };
        if (v instanceof Nothing) {
            return Nothing.value;
        };
        throw new Error("Failed pattern match at Data.Maybe line 78, column 3 - line 78, column 31: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var bindMaybe = new Control_Bind.Bind(function () {
    return applyMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Just) {
            return v1(v.value0);
        };
        if (v instanceof Nothing) {
            return Nothing.value;
        };
        throw new Error("Failed pattern match at Data.Maybe line 137, column 3 - line 137, column 24: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var applicativeMaybe = new Control_Applicative.Applicative(function () {
    return applyMaybe;
}, Just.create);
var monadMaybe = new Control_Monad.Monad(function () {
    return applicativeMaybe;
}, function () {
    return bindMaybe;
});
var altMaybe = new Control_Alt.Alt(function () {
    return functorMaybe;
}, function (v) {
    return function (v1) {
        if (v instanceof Nothing) {
            return v1;
        };
        return v;
    };
});
var plusMaybe = new Control_Plus.Plus(function () {
    return altMaybe;
}, Nothing.value);
var alternativeMaybe = new Control_Alternative.Alternative(function () {
    return applicativeMaybe;
}, function () {
    return plusMaybe;
});
var monadZeroMaybe = new Control_MonadZero.MonadZero(function () {
    return alternativeMaybe;
}, function () {
    return monadMaybe;
});
module.exports = {
    Just: Just, 
    Nothing: Nothing, 
    fromJust: fromJust, 
    fromMaybe: fromMaybe, 
    "fromMaybe'": fromMaybe$prime, 
    isJust: isJust, 
    isNothing: isNothing, 
    maybe: maybe, 
    "maybe'": maybe$prime, 
    functorMaybe: functorMaybe, 
    applyMaybe: applyMaybe, 
    applicativeMaybe: applicativeMaybe, 
    altMaybe: altMaybe, 
    plusMaybe: plusMaybe, 
    alternativeMaybe: alternativeMaybe, 
    bindMaybe: bindMaybe, 
    monadMaybe: monadMaybe, 
    monadZeroMaybe: monadZeroMaybe, 
    extendMaybe: extendMaybe, 
    invariantMaybe: invariantMaybe, 
    semigroupMaybe: semigroupMaybe, 
    monoidMaybe: monoidMaybe, 
    eqMaybe: eqMaybe, 
    ordMaybe: ordMaybe, 
    boundedMaybe: boundedMaybe, 
    showMaybe: showMaybe
};

},{"../Control.Alt":12,"../Control.Alternative":13,"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Extend":25,"../Control.Monad":61,"../Control.MonadZero":63,"../Control.Plus":65,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Function":91,"../Data.Functor":94,"../Data.Functor.Invariant":92,"../Data.Monoid":111,"../Data.Ord":116,"../Data.Ordering":117,"../Data.Semigroup":121,"../Data.Show":125,"../Data.Unit":135}],105:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Additive = function (x) {
    return x;
};
var showAdditive = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Additive " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semigroupAdditive = function (dictSemiring) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_Semiring.add(dictSemiring)(v)(v1);
        };
    });
};
var runAdditive = function (v) {
    return v;
};
var monoidAdditive = function (dictSemiring) {
    return new Data_Monoid.Monoid(function () {
        return semigroupAdditive(dictSemiring);
    }, Data_Semiring.zero(dictSemiring));
};
var invariantAdditive = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorAdditive = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendAdditive = new Control_Extend.Extend(function () {
    return functorAdditive;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqAdditive = function (dictEq) {
    return new Data_Eq.Eq(function (v) {
        return function (v1) {
            return Data_Eq.eq(dictEq)(v)(v1);
        };
    });
};
var ordAdditive = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqAdditive(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (v) {
        return function (v1) {
            return Data_Ord.compare(dictOrd)(v)(v1);
        };
    });
};
var comonadAdditive = new Control_Comonad.Comonad(function () {
    return extendAdditive;
}, runAdditive);
var boundedAdditive = function (dictBounded) {
    return new Data_Bounded.Bounded(function () {
        return ordAdditive(dictBounded["__superclass_Data.Ord.Ord_0"]());
    }, Data_Bounded.bottom(dictBounded), Data_Bounded.top(dictBounded));
};
var applyAdditive = new Control_Apply.Apply(function () {
    return functorAdditive;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindAdditive = new Control_Bind.Bind(function () {
    return applyAdditive;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeAdditive = new Control_Applicative.Applicative(function () {
    return applyAdditive;
}, Additive);
var monadAdditive = new Control_Monad.Monad(function () {
    return applicativeAdditive;
}, function () {
    return bindAdditive;
});
module.exports = {
    Additive: Additive, 
    runAdditive: runAdditive, 
    eqAdditive: eqAdditive, 
    ordAdditive: ordAdditive, 
    boundedAdditive: boundedAdditive, 
    functorAdditive: functorAdditive, 
    invariantAdditive: invariantAdditive, 
    applyAdditive: applyAdditive, 
    applicativeAdditive: applicativeAdditive, 
    bindAdditive: bindAdditive, 
    monadAdditive: monadAdditive, 
    extendAdditive: extendAdditive, 
    comonadAdditive: comonadAdditive, 
    showAdditive: showAdditive, 
    semigroupAdditive: semigroupAdditive, 
    monoidAdditive: monoidAdditive
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":94,"../Data.Functor.Invariant":92,"../Data.Monoid":111,"../Data.Ord":116,"../Data.Semigroup":121,"../Data.Semiring":123,"../Data.Show":125}],106:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Conj = function (x) {
    return x;
};
var showConj = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Conj " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semiringConj = function (dictHeytingAlgebra) {
    return new Data_Semiring.Semiring(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v)(v1);
        };
    }, function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v)(v1);
        };
    }, Data_HeytingAlgebra.ff(dictHeytingAlgebra), Data_HeytingAlgebra.tt(dictHeytingAlgebra));
};
var semigroupConj = function (dictHeytingAlgebra) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v)(v1);
        };
    });
};
var runConj = function (v) {
    return v;
};
var monoidConj = function (dictHeytingAlgebra) {
    return new Data_Monoid.Monoid(function () {
        return semigroupConj(dictHeytingAlgebra);
    }, Data_HeytingAlgebra.tt(dictHeytingAlgebra));
};
var invariantConj = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorConj = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendConj = new Control_Extend.Extend(function () {
    return functorConj;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqConj = function (dictEq) {
    return new Data_Eq.Eq(function (v) {
        return function (v1) {
            return Data_Eq.eq(dictEq)(v)(v1);
        };
    });
};
var ordConj = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqConj(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (v) {
        return function (v1) {
            return Data_Ord.compare(dictOrd)(v)(v1);
        };
    });
};
var comonadConj = new Control_Comonad.Comonad(function () {
    return extendConj;
}, runConj);
var boundedConj = function (dictBounded) {
    return new Data_Bounded.Bounded(function () {
        return ordConj(dictBounded["__superclass_Data.Ord.Ord_0"]());
    }, Data_Bounded.bottom(dictBounded), Data_Bounded.top(dictBounded));
};
var applyConj = new Control_Apply.Apply(function () {
    return functorConj;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindConj = new Control_Bind.Bind(function () {
    return applyConj;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeConj = new Control_Applicative.Applicative(function () {
    return applyConj;
}, Conj);
var monadConj = new Control_Monad.Monad(function () {
    return applicativeConj;
}, function () {
    return bindConj;
});
module.exports = {
    Conj: Conj, 
    runConj: runConj, 
    eqConj: eqConj, 
    ordConj: ordConj, 
    boundedConj: boundedConj, 
    functorConj: functorConj, 
    invariantConj: invariantConj, 
    applyConj: applyConj, 
    applicativeConj: applicativeConj, 
    bindConj: bindConj, 
    monadConj: monadConj, 
    extendConj: extendConj, 
    comonadConj: comonadConj, 
    showConj: showConj, 
    semigroupConj: semigroupConj, 
    monoidConj: monoidConj, 
    semiringConj: semiringConj
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":94,"../Data.Functor.Invariant":92,"../Data.HeytingAlgebra":96,"../Data.Monoid":111,"../Data.Ord":116,"../Data.Semigroup":121,"../Data.Semiring":123,"../Data.Show":125}],107:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Disj = function (x) {
    return x;
};
var showDisj = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Disj " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semiringDisj = function (dictHeytingAlgebra) {
    return new Data_Semiring.Semiring(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v)(v1);
        };
    }, function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v)(v1);
        };
    }, Data_HeytingAlgebra.tt(dictHeytingAlgebra), Data_HeytingAlgebra.ff(dictHeytingAlgebra));
};
var semigroupDisj = function (dictHeytingAlgebra) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v)(v1);
        };
    });
};
var runDisj = function (v) {
    return v;
};
var monoidDisj = function (dictHeytingAlgebra) {
    return new Data_Monoid.Monoid(function () {
        return semigroupDisj(dictHeytingAlgebra);
    }, Data_HeytingAlgebra.ff(dictHeytingAlgebra));
};
var functorDisj = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendDisj = new Control_Extend.Extend(function () {
    return functorDisj;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqDisj = function (dictEq) {
    return new Data_Eq.Eq(function (v) {
        return function (v1) {
            return Data_Eq.eq(dictEq)(v)(v1);
        };
    });
};
var ordDisj = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqDisj(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (v) {
        return function (v1) {
            return Data_Ord.compare(dictOrd)(v)(v1);
        };
    });
};
var comonadDisj = new Control_Comonad.Comonad(function () {
    return extendDisj;
}, runDisj);
var boundedDisj = function (dictBounded) {
    return new Data_Bounded.Bounded(function () {
        return ordDisj(dictBounded["__superclass_Data.Ord.Ord_0"]());
    }, Data_Bounded.bottom(dictBounded), Data_Bounded.top(dictBounded));
};
var applyDisj = new Control_Apply.Apply(function () {
    return functorDisj;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindDisj = new Control_Bind.Bind(function () {
    return applyDisj;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeDisj = new Control_Applicative.Applicative(function () {
    return applyDisj;
}, Disj);
var monadDisj = new Control_Monad.Monad(function () {
    return applicativeDisj;
}, function () {
    return bindDisj;
});
module.exports = {
    Disj: Disj, 
    runDisj: runDisj, 
    eqDisj: eqDisj, 
    ordDisj: ordDisj, 
    boundedDisj: boundedDisj, 
    functorDisj: functorDisj, 
    applyDisj: applyDisj, 
    applicativeDisj: applicativeDisj, 
    bindDisj: bindDisj, 
    monadDisj: monadDisj, 
    extendDisj: extendDisj, 
    comonadDisj: comonadDisj, 
    showDisj: showDisj, 
    semigroupDisj: semigroupDisj, 
    monoidDisj: monoidDisj, 
    semiringDisj: semiringDisj
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":94,"../Data.HeytingAlgebra":96,"../Data.Monoid":111,"../Data.Ord":116,"../Data.Semigroup":121,"../Data.Semiring":123,"../Data.Show":125}],108:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var Dual = function (x) {
    return x;
};
var showDual = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Dual " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semigroupDual = function (dictSemigroup) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_Semigroup.append(dictSemigroup)(v1)(v);
        };
    });
};
var runDual = function (v) {
    return v;
};
var monoidDual = function (dictMonoid) {
    return new Data_Monoid.Monoid(function () {
        return semigroupDual(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    }, Data_Monoid.mempty(dictMonoid));
};
var invariantDual = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorDual = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendDual = new Control_Extend.Extend(function () {
    return functorDual;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqDual = function (dictEq) {
    return new Data_Eq.Eq(function (v) {
        return function (v1) {
            return Data_Eq.eq(dictEq)(v)(v1);
        };
    });
};
var ordDual = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqDual(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (v) {
        return function (v1) {
            return Data_Ord.compare(dictOrd)(v)(v1);
        };
    });
};
var comonadDual = new Control_Comonad.Comonad(function () {
    return extendDual;
}, runDual);
var boundedDual = function (dictBounded) {
    return new Data_Bounded.Bounded(function () {
        return ordDual(dictBounded["__superclass_Data.Ord.Ord_0"]());
    }, Data_Bounded.bottom(dictBounded), Data_Bounded.top(dictBounded));
};
var applyDual = new Control_Apply.Apply(function () {
    return functorDual;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindDual = new Control_Bind.Bind(function () {
    return applyDual;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeDual = new Control_Applicative.Applicative(function () {
    return applyDual;
}, Dual);
var monadDual = new Control_Monad.Monad(function () {
    return applicativeDual;
}, function () {
    return bindDual;
});
module.exports = {
    Dual: Dual, 
    runDual: runDual, 
    eqDual: eqDual, 
    ordDual: ordDual, 
    boundedDual: boundedDual, 
    functorDual: functorDual, 
    invariantDual: invariantDual, 
    applyDual: applyDual, 
    applicativeDual: applicativeDual, 
    bindDual: bindDual, 
    monadDual: monadDual, 
    extendDual: extendDual, 
    comonadDual: comonadDual, 
    showDual: showDual, 
    semigroupDual: semigroupDual, 
    monoidDual: monoidDual
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":94,"../Data.Functor.Invariant":92,"../Data.Monoid":111,"../Data.Ord":116,"../Data.Semigroup":121,"../Data.Show":125}],109:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_Function = require("../Data.Function");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Semigroup = require("../Data.Semigroup");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Control_Category = require("../Control.Category");
var Endo = function (x) {
    return x;
};
var semigroupEndo = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        return function ($10) {
            return v(v1($10));
        };
    };
});
var runEndo = function (v) {
    return v;
};
var monoidEndo = new Data_Monoid.Monoid(function () {
    return semigroupEndo;
}, Control_Category.id(Control_Category.categoryFn));
var invariantEndo = new Data_Functor_Invariant.Invariant(function (ab) {
    return function (ba) {
        return function (v) {
            return function ($11) {
                return ab(v(ba($11)));
            };
        };
    };
});
module.exports = {
    Endo: Endo, 
    runEndo: runEndo, 
    invariantEndo: invariantEndo, 
    semigroupEndo: semigroupEndo, 
    monoidEndo: monoidEndo
};

},{"../Control.Category":21,"../Control.Semigroupoid":66,"../Data.Function":91,"../Data.Functor.Invariant":92,"../Data.Monoid":111,"../Data.Semigroup":121}],110:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Monad = require("../Control.Monad");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Multiplicative = function (x) {
    return x;
};
var showMultiplicative = function (dictShow) {
    return new Data_Show.Show(function (v) {
        return "(Multiplicative " + (Data_Show.show(dictShow)(v) + ")");
    });
};
var semigroupMultiplicative = function (dictSemiring) {
    return new Data_Semigroup.Semigroup(function (v) {
        return function (v1) {
            return Data_Semiring.mul(dictSemiring)(v)(v1);
        };
    });
};
var runMultiplicative = function (v) {
    return v;
};
var monoidMultiplicative = function (dictSemiring) {
    return new Data_Monoid.Monoid(function () {
        return semigroupMultiplicative(dictSemiring);
    }, Data_Semiring.one(dictSemiring));
};
var invariantMultiplicative = new Data_Functor_Invariant.Invariant(function (f) {
    return function (v) {
        return function (v1) {
            return f(v1);
        };
    };
});
var functorMultiplicative = new Data_Functor.Functor(function (f) {
    return function (v) {
        return f(v);
    };
});
var extendMultiplicative = new Control_Extend.Extend(function () {
    return functorMultiplicative;
}, function (f) {
    return function (x) {
        return f(x);
    };
});
var eqMultiplicative = function (dictEq) {
    return new Data_Eq.Eq(function (v) {
        return function (v1) {
            return Data_Eq.eq(dictEq)(v)(v1);
        };
    });
};
var ordMultiplicative = function (dictOrd) {
    return new Data_Ord.Ord(function () {
        return eqMultiplicative(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, function (v) {
        return function (v1) {
            return Data_Ord.compare(dictOrd)(v)(v1);
        };
    });
};
var comonadMultiplicative = new Control_Comonad.Comonad(function () {
    return extendMultiplicative;
}, runMultiplicative);
var boundedMultiplicative = function (dictBounded) {
    return new Data_Bounded.Bounded(function () {
        return ordMultiplicative(dictBounded["__superclass_Data.Ord.Ord_0"]());
    }, Data_Bounded.bottom(dictBounded), Data_Bounded.top(dictBounded));
};
var applyMultiplicative = new Control_Apply.Apply(function () {
    return functorMultiplicative;
}, function (v) {
    return function (v1) {
        return v(v1);
    };
});
var bindMultiplicative = new Control_Bind.Bind(function () {
    return applyMultiplicative;
}, function (v) {
    return function (f) {
        return f(v);
    };
});
var applicativeMultiplicative = new Control_Applicative.Applicative(function () {
    return applyMultiplicative;
}, Multiplicative);
var monadMultiplicative = new Control_Monad.Monad(function () {
    return applicativeMultiplicative;
}, function () {
    return bindMultiplicative;
});
module.exports = {
    Multiplicative: Multiplicative, 
    runMultiplicative: runMultiplicative, 
    eqMultiplicative: eqMultiplicative, 
    ordMultiplicative: ordMultiplicative, 
    boundedMultiplicative: boundedMultiplicative, 
    functorMultiplicative: functorMultiplicative, 
    invariantMultiplicative: invariantMultiplicative, 
    applyMultiplicative: applyMultiplicative, 
    applicativeMultiplicative: applicativeMultiplicative, 
    bindMultiplicative: bindMultiplicative, 
    monadMultiplicative: monadMultiplicative, 
    extendMultiplicative: extendMultiplicative, 
    comonadMultiplicative: comonadMultiplicative, 
    showMultiplicative: showMultiplicative, 
    semigroupMultiplicative: semigroupMultiplicative, 
    monoidMultiplicative: monoidMultiplicative
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Monad":61,"../Data.Bounded":76,"../Data.Eq":81,"../Data.Functor":94,"../Data.Functor.Invariant":92,"../Data.Monoid":111,"../Data.Ord":116,"../Data.Semigroup":121,"../Data.Semiring":123,"../Data.Show":125}],111:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_Function = require("../Data.Function");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Unit = require("../Data.Unit");
var Monoid = function (__superclass_Data$dotSemigroup$dotSemigroup_0, mempty) {
    this["__superclass_Data.Semigroup.Semigroup_0"] = __superclass_Data$dotSemigroup$dotSemigroup_0;
    this.mempty = mempty;
};
var monoidUnit = new Monoid(function () {
    return Data_Semigroup.semigroupUnit;
}, Data_Unit.unit);
var monoidString = new Monoid(function () {
    return Data_Semigroup.semigroupString;
}, "");
var monoidArray = new Monoid(function () {
    return Data_Semigroup.semigroupArray;
}, [  ]);
var mempty = function (dict) {
    return dict.mempty;
};
var monoidFn = function (dictMonoid) {
    return new Monoid(function () {
        return Data_Semigroup.semigroupFn(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    }, Data_Function["const"](mempty(dictMonoid)));
};
module.exports = {
    Monoid: Monoid, 
    mempty: mempty, 
    monoidUnit: monoidUnit, 
    monoidFn: monoidFn, 
    monoidString: monoidString, 
    monoidArray: monoidArray
};

},{"../Data.Function":91,"../Data.Semigroup":121,"../Data.Unit":135}],112:[function(require,module,exports){
arguments[4][69][0].apply(exports,arguments)
},{"dup":69}],113:[function(require,module,exports){
"use strict";

// module Data.Ord.Unsafe

exports.unsafeCompareImpl = function (lt) {
  return function (eq) {
    return function (gt) {
      return function (x) {
        return function (y) {
          return x < y ? lt : x > y ? gt : eq;
        };
      };
    };
  };
};

},{}],114:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Ordering = require("../Data.Ordering");
var unsafeCompare = $foreign.unsafeCompareImpl(Data_Ordering.LT.value)(Data_Ordering.EQ.value)(Data_Ordering.GT.value);
module.exports = {
    unsafeCompare: unsafeCompare
};

},{"../Data.Ordering":117,"./foreign":113}],115:[function(require,module,exports){
"use strict";

// module Data.Ord

exports.ordArrayImpl = function (f) {
  return function (xs) {
    return function (ys) {
      var i = 0;
      var xlen = xs.length;
      var ylen = ys.length;
      while (i < xlen && i < ylen) {
        var x = xs[i];
        var y = ys[i];
        var o = f(x)(y);
        if (o !== 0) {
          return o;
        }
        i++;
      }
      if (xlen === ylen) {
        return 0;
      } else if (xlen > ylen) {
        return -1;
      } else {
        return 1;
      }
    };
  };
};

},{}],116:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Eq = require("../Data.Eq");
var Data_Function = require("../Data.Function");
var Data_Ord_Unsafe = require("../Data.Ord.Unsafe");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
var Data_Semiring = require("../Data.Semiring");
var Ord = function (__superclass_Data$dotEq$dotEq_0, compare) {
    this["__superclass_Data.Eq.Eq_0"] = __superclass_Data$dotEq$dotEq_0;
    this.compare = compare;
};
var ordVoid = new Ord(function () {
    return Data_Eq.eqVoid;
}, function (v) {
    return function (v1) {
        return Data_Ordering.EQ.value;
    };
});
var ordUnit = new Ord(function () {
    return Data_Eq.eqUnit;
}, function (v) {
    return function (v1) {
        return Data_Ordering.EQ.value;
    };
});
var ordString = new Ord(function () {
    return Data_Eq.eqString;
}, Data_Ord_Unsafe.unsafeCompare);
var ordOrdering = new Ord(function () {
    return Data_Ordering.eqOrdering;
}, function (v) {
    return function (v1) {
        if (v instanceof Data_Ordering.LT && v1 instanceof Data_Ordering.LT) {
            return Data_Ordering.EQ.value;
        };
        if (v instanceof Data_Ordering.EQ && v1 instanceof Data_Ordering.EQ) {
            return Data_Ordering.EQ.value;
        };
        if (v instanceof Data_Ordering.GT && v1 instanceof Data_Ordering.GT) {
            return Data_Ordering.EQ.value;
        };
        if (v instanceof Data_Ordering.LT) {
            return Data_Ordering.LT.value;
        };
        if (v instanceof Data_Ordering.EQ && v1 instanceof Data_Ordering.LT) {
            return Data_Ordering.GT.value;
        };
        if (v instanceof Data_Ordering.EQ && v1 instanceof Data_Ordering.GT) {
            return Data_Ordering.LT.value;
        };
        if (v instanceof Data_Ordering.GT) {
            return Data_Ordering.GT.value;
        };
        throw new Error("Failed pattern match at Data.Ord line 68, column 3 - line 68, column 21: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var ordNumber = new Ord(function () {
    return Data_Eq.eqNumber;
}, Data_Ord_Unsafe.unsafeCompare);
var ordInt = new Ord(function () {
    return Data_Eq.eqInt;
}, Data_Ord_Unsafe.unsafeCompare);
var ordChar = new Ord(function () {
    return Data_Eq.eqChar;
}, Data_Ord_Unsafe.unsafeCompare);
var ordBoolean = new Ord(function () {
    return Data_Eq.eqBoolean;
}, Data_Ord_Unsafe.unsafeCompare);
var compare = function (dict) {
    return dict.compare;
};
var comparing = function (dictOrd) {
    return function (f) {
        return Data_Function.on(compare(dictOrd))(f);
    };
};
var greaterThan = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var $22 = compare(dictOrd)(a1)(a2);
            if ($22 instanceof Data_Ordering.GT) {
                return true;
            };
            return false;
        };
    };
};
var greaterThanOrEq = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var $23 = compare(dictOrd)(a1)(a2);
            if ($23 instanceof Data_Ordering.LT) {
                return false;
            };
            return true;
        };
    };
};
var signum = function (dictOrd) {
    return function (dictRing) {
        return function (x) {
            var $24 = greaterThanOrEq(dictOrd)(x)(Data_Semiring.zero(dictRing["__superclass_Data.Semiring.Semiring_0"]()));
            if ($24) {
                return Data_Semiring.one(dictRing["__superclass_Data.Semiring.Semiring_0"]());
            };
            if (!$24) {
                return Data_Ring.negate(dictRing)(Data_Semiring.one(dictRing["__superclass_Data.Semiring.Semiring_0"]()));
            };
            throw new Error("Failed pattern match at Data.Ord line 163, column 12 - line 163, column 46: " + [ $24.constructor.name ]);
        };
    };
};
var lessThan = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var $25 = compare(dictOrd)(a1)(a2);
            if ($25 instanceof Data_Ordering.LT) {
                return true;
            };
            return false;
        };
    };
};
var lessThanOrEq = function (dictOrd) {
    return function (a1) {
        return function (a2) {
            var $26 = compare(dictOrd)(a1)(a2);
            if ($26 instanceof Data_Ordering.GT) {
                return false;
            };
            return true;
        };
    };
};
var max = function (dictOrd) {
    return function (x) {
        return function (y) {
            var $27 = compare(dictOrd)(x)(y);
            if ($27 instanceof Data_Ordering.LT) {
                return y;
            };
            if ($27 instanceof Data_Ordering.EQ) {
                return x;
            };
            if ($27 instanceof Data_Ordering.GT) {
                return x;
            };
            throw new Error("Failed pattern match at Data.Ord line 122, column 3 - line 125, column 12: " + [ $27.constructor.name ]);
        };
    };
};
var min = function (dictOrd) {
    return function (x) {
        return function (y) {
            var $28 = compare(dictOrd)(x)(y);
            if ($28 instanceof Data_Ordering.LT) {
                return x;
            };
            if ($28 instanceof Data_Ordering.EQ) {
                return x;
            };
            if ($28 instanceof Data_Ordering.GT) {
                return y;
            };
            throw new Error("Failed pattern match at Data.Ord line 113, column 3 - line 116, column 12: " + [ $28.constructor.name ]);
        };
    };
};
var ordArray = function (dictOrd) {
    return new Ord(function () {
        return Data_Eq.eqArray(dictOrd["__superclass_Data.Eq.Eq_0"]());
    }, (function () {
        var toDelta = function (x) {
            return function (y) {
                var $29 = compare(dictOrd)(x)(y);
                if ($29 instanceof Data_Ordering.EQ) {
                    return 0;
                };
                if ($29 instanceof Data_Ordering.LT) {
                    return 1;
                };
                if ($29 instanceof Data_Ordering.GT) {
                    return -1;
                };
                throw new Error("Failed pattern match at Data.Ord line 60, column 7 - line 65, column 1: " + [ $29.constructor.name ]);
            };
        };
        return function (xs) {
            return function (ys) {
                return compare(ordInt)(0)($foreign.ordArrayImpl(toDelta)(xs)(ys));
            };
        };
    })());
};
var clamp = function (dictOrd) {
    return function (low) {
        return function (hi) {
            return function (x) {
                return min(dictOrd)(hi)(max(dictOrd)(low)(x));
            };
        };
    };
};
var between = function (dictOrd) {
    return function (low) {
        return function (hi) {
            return function (x) {
                if (lessThan(dictOrd)(x)(low)) {
                    return false;
                };
                if (greaterThan(dictOrd)(x)(hi)) {
                    return false;
                };
                if (true) {
                    return true;
                };
                throw new Error("Failed pattern match at Data.Ord line 150, column 1 - line 153, column 16: " + [ low.constructor.name, hi.constructor.name, x.constructor.name ]);
            };
        };
    };
};
var abs = function (dictOrd) {
    return function (dictRing) {
        return function (x) {
            var $33 = greaterThanOrEq(dictOrd)(x)(Data_Semiring.zero(dictRing["__superclass_Data.Semiring.Semiring_0"]()));
            if ($33) {
                return x;
            };
            if (!$33) {
                return Data_Ring.negate(dictRing)(x);
            };
            throw new Error("Failed pattern match at Data.Ord line 158, column 9 - line 158, column 42: " + [ $33.constructor.name ]);
        };
    };
};
module.exports = {
    Ord: Ord, 
    abs: abs, 
    between: between, 
    clamp: clamp, 
    compare: compare, 
    comparing: comparing, 
    greaterThan: greaterThan, 
    greaterThanOrEq: greaterThanOrEq, 
    lessThan: lessThan, 
    lessThanOrEq: lessThanOrEq, 
    max: max, 
    min: min, 
    signum: signum, 
    ordBoolean: ordBoolean, 
    ordInt: ordInt, 
    ordNumber: ordNumber, 
    ordString: ordString, 
    ordChar: ordChar, 
    ordUnit: ordUnit, 
    ordVoid: ordVoid, 
    ordArray: ordArray, 
    ordOrdering: ordOrdering
};

},{"../Data.Eq":81,"../Data.Function":91,"../Data.Ord.Unsafe":114,"../Data.Ordering":117,"../Data.Ring":119,"../Data.Semiring":123,"../Data.Unit":135,"../Data.Void":136,"./foreign":115}],117:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_Eq = require("../Data.Eq");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Show = require("../Data.Show");
var LT = (function () {
    function LT() {

    };
    LT.value = new LT();
    return LT;
})();
var GT = (function () {
    function GT() {

    };
    GT.value = new GT();
    return GT;
})();
var EQ = (function () {
    function EQ() {

    };
    EQ.value = new EQ();
    return EQ;
})();
var showOrdering = new Data_Show.Show(function (v) {
    if (v instanceof LT) {
        return "LT";
    };
    if (v instanceof GT) {
        return "GT";
    };
    if (v instanceof EQ) {
        return "EQ";
    };
    throw new Error("Failed pattern match at Data.Ordering line 27, column 3 - line 28, column 3: " + [ v.constructor.name ]);
});
var semigroupOrdering = new Data_Semigroup.Semigroup(function (v) {
    return function (v1) {
        if (v instanceof LT) {
            return LT.value;
        };
        if (v instanceof GT) {
            return GT.value;
        };
        if (v instanceof EQ) {
            return v1;
        };
        throw new Error("Failed pattern match at Data.Ordering line 22, column 3 - line 22, column 19: " + [ v.constructor.name, v1.constructor.name ]);
    };
});
var invert = function (v) {
    if (v instanceof GT) {
        return LT.value;
    };
    if (v instanceof EQ) {
        return EQ.value;
    };
    if (v instanceof LT) {
        return GT.value;
    };
    throw new Error("Failed pattern match at Data.Ordering line 34, column 1 - line 34, column 15: " + [ v.constructor.name ]);
};
var eqOrdering = new Data_Eq.Eq(function (v) {
    return function (v1) {
        if (v instanceof LT && v1 instanceof LT) {
            return true;
        };
        if (v instanceof GT && v1 instanceof GT) {
            return true;
        };
        if (v instanceof EQ && v1 instanceof EQ) {
            return true;
        };
        return false;
    };
});
module.exports = {
    LT: LT, 
    GT: GT, 
    EQ: EQ, 
    invert: invert, 
    eqOrdering: eqOrdering, 
    semigroupOrdering: semigroupOrdering, 
    showOrdering: showOrdering
};

},{"../Data.Eq":81,"../Data.Semigroup":121,"../Data.Show":125}],118:[function(require,module,exports){
"use strict";

// module Data.Ring

exports.intSub = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x - y | 0;
  };
};

exports.numSub = function (n1) {
  return function (n2) {
    return n1 - n2;
  };
};

},{}],119:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Semiring = require("../Data.Semiring");
var Data_Unit = require("../Data.Unit");
var Ring = function (__superclass_Data$dotSemiring$dotSemiring_0, sub) {
    this["__superclass_Data.Semiring.Semiring_0"] = __superclass_Data$dotSemiring$dotSemiring_0;
    this.sub = sub;
};
var sub = function (dict) {
    return dict.sub;
};
var ringUnit = new Ring(function () {
    return Data_Semiring.semiringUnit;
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
});
var ringNumber = new Ring(function () {
    return Data_Semiring.semiringNumber;
}, $foreign.numSub);
var ringInt = new Ring(function () {
    return Data_Semiring.semiringInt;
}, $foreign.intSub);
var negate = function (dictRing) {
    return function (a) {
        return sub(dictRing)(Data_Semiring.zero(dictRing["__superclass_Data.Semiring.Semiring_0"]()))(a);
    };
};
module.exports = {
    Ring: Ring, 
    negate: negate, 
    sub: sub, 
    ringInt: ringInt, 
    ringNumber: ringNumber, 
    ringUnit: ringUnit
};

},{"../Data.Semiring":123,"../Data.Unit":135,"./foreign":118}],120:[function(require,module,exports){
"use strict";

// module Data.Semigroup

exports.concatString = function (s1) {
  return function (s2) {
    return s1 + s2;
  };
};

exports.concatArray = function (xs) {
  return function (ys) {
    return xs.concat(ys);
  };
};

},{}],121:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
var Semigroup = function (append) {
    this.append = append;
};
var semigroupVoid = new Semigroup(function (v) {
    return Data_Void.absurd;
});
var semigroupUnit = new Semigroup(function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
});
var semigroupString = new Semigroup($foreign.concatString);
var semigroupArray = new Semigroup($foreign.concatArray);
var append = function (dict) {
    return dict.append;
};
var semigroupFn = function (dictSemigroup) {
    return new Semigroup(function (f) {
        return function (g) {
            return function (x) {
                return append(dictSemigroup)(f(x))(g(x));
            };
        };
    });
};
module.exports = {
    Semigroup: Semigroup, 
    append: append, 
    semigroupString: semigroupString, 
    semigroupUnit: semigroupUnit, 
    semigroupVoid: semigroupVoid, 
    semigroupFn: semigroupFn, 
    semigroupArray: semigroupArray
};

},{"../Data.Unit":135,"../Data.Void":136,"./foreign":120}],122:[function(require,module,exports){
"use strict";

// module Data.Semiring

exports.intAdd = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x + y | 0;
  };
};

exports.intMul = function (x) {
  return function (y) {
    /* jshint bitwise: false */
    return x * y | 0;
  };
};

exports.numAdd = function (n1) {
  return function (n2) {
    return n1 + n2;
  };
};

exports.numMul = function (n1) {
  return function (n2) {
    return n1 * n2;
  };
};

},{}],123:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Unit = require("../Data.Unit");
var Semiring = function (add, mul, one, zero) {
    this.add = add;
    this.mul = mul;
    this.one = one;
    this.zero = zero;
};
var zero = function (dict) {
    return dict.zero;
};
var semiringUnit = new Semiring(function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, function (v) {
    return function (v1) {
        return Data_Unit.unit;
    };
}, Data_Unit.unit, Data_Unit.unit);
var semiringNumber = new Semiring($foreign.numAdd, $foreign.numMul, 1.0, 0.0);
var semiringInt = new Semiring($foreign.intAdd, $foreign.intMul, 1, 0);
var one = function (dict) {
    return dict.one;
};
var mul = function (dict) {
    return dict.mul;
};
var add = function (dict) {
    return dict.add;
};
module.exports = {
    Semiring: Semiring, 
    add: add, 
    mul: mul, 
    one: one, 
    zero: zero, 
    semiringInt: semiringInt, 
    semiringNumber: semiringNumber, 
    semiringUnit: semiringUnit
};

},{"../Data.Unit":135,"./foreign":122}],124:[function(require,module,exports){
"use strict";

// module Data.Show

exports.showIntImpl = function (n) {
  return n.toString();
};

exports.showNumberImpl = function (n) {
  var str = n.toString();
  return isNaN(str + ".0") ? str : str + ".0";
};

exports.showCharImpl = function (c) {
  var code = c.charCodeAt(0);
  if (code < 0x20 || code === 0x7F) {
    switch (c) {
      case "\x07": return "'\\a'";
      case "\b": return "'\\b'";
      case "\f": return "'\\f'";
      case "\n": return "'\\n'";
      case "\r": return "'\\r'";
      case "\t": return "'\\t'";
      case "\v": return "'\\v'";
    }
    return "'\\" + code.toString(10) + "'";
  }
  return c === "'" || c === "\\" ? "'\\" + c + "'" : "'" + c + "'";
};

exports.showStringImpl = function (s) {
  var l = s.length;
  return "\"" + s.replace(
    /[\0-\x1F\x7F"\\]/g,
    function (c, i) { // jshint ignore:line
      switch (c) {
        case "\"":
        case "\\":
          return "\\" + c;
        case "\x07": return "\\a";
        case "\b": return "\\b";
        case "\f": return "\\f";
        case "\n": return "\\n";
        case "\r": return "\\r";
        case "\t": return "\\t";
        case "\v": return "\\v";
      }
      var k = i + 1;
      var empty = k < l && s[k] >= "0" && s[k] <= "9" ? "\\&" : "";
      return "\\" + c.charCodeAt(0).toString(10) + empty;
    }
  ) + "\"";
};

exports.showArrayImpl = function (f) {
  return function (xs) {
    var ss = [];
    for (var i = 0, l = xs.length; i < l; i++) {
      ss[i] = f(xs[i]);
    }
    return "[" + ss.join(",") + "]";
  };
};

},{}],125:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Show = function (show) {
    this.show = show;
};
var showString = new Show($foreign.showStringImpl);
var showNumber = new Show($foreign.showNumberImpl);
var showInt = new Show($foreign.showIntImpl);
var showChar = new Show($foreign.showCharImpl);
var showBoolean = new Show(function (v) {
    if (v) {
        return "true";
    };
    if (!v) {
        return "false";
    };
    throw new Error("Failed pattern match at Data.Show line 13, column 3 - line 14, column 3: " + [ v.constructor.name ]);
});
var show = function (dict) {
    return dict.show;
};
var showArray = function (dictShow) {
    return new Show($foreign.showArrayImpl(show(dictShow)));
};
module.exports = {
    Show: Show, 
    show: show, 
    showBoolean: showBoolean, 
    showInt: showInt, 
    showNumber: showNumber, 
    showChar: showChar, 
    showString: showString, 
    showArray: showArray
};

},{"./foreign":124}],126:[function(require,module,exports){
/* global exports */
"use strict";

// module Data.String.Unsafe

exports.charCodeAt = function (i) {
  return function (s) {
    if (i >= 0 && i < s.length) return s.charCodeAt(i);
    throw new Error("Data.String.Unsafe.charCodeAt: Invalid index.");
  };
};

exports.charAt = function (i) {
  return function (s) {
    if (i >= 0 && i < s.length) return s.charAt(i);
    throw new Error("Data.String.Unsafe.charAt: Invalid index.");
  };
};

exports.char = function (s) {
  if (s.length === 1) return s.charAt(0);
  throw new Error("Data.String.Unsafe.char: Expected string of length 1.");
};

},{}],127:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
module.exports = {
    "char": $foreign["char"], 
    charAt: $foreign.charAt, 
    charCodeAt: $foreign.charCodeAt
};

},{"./foreign":126}],128:[function(require,module,exports){
/* global exports */
"use strict";

// module Data.String

exports._charAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (s) {
        return i >= 0 && i < s.length ? just(s.charAt(i)) : nothing;
      };
    };
  };
};

exports.singleton = function (c) {
  return c;
};

exports._charCodeAt = function (just) {
  return function (nothing) {
    return function (i) {
      return function (s) {
        return i >= 0 && i < s.length ? just(s.charCodeAt(i)) : nothing;
      };
    };
  };
};

exports._toChar = function (just) {
  return function (nothing) {
    return function (s) {
      return s.length === 1 ? just(s) : nothing;
    };
  };
};

exports.fromCharArray = function (a) {
  return a.join("");
};

exports._indexOf = function (just) {
  return function (nothing) {
    return function (x) {
      return function (s) {
        var i = s.indexOf(x);
        return i === -1 ? nothing : just(i);
      };
    };
  };
};

exports["_indexOf'"] = function (just) {
  return function (nothing) {
    return function (x) {
      return function (startAt) {
        return function (s) {
          if (startAt < 0 || startAt > s.length) return nothing;
          var i = s.indexOf(x, startAt);
          return i === -1 ? nothing : just(i);
        };
      };
    };
  };
};

exports._lastIndexOf = function (just) {
  return function (nothing) {
    return function (x) {
      return function (s) {
        var i = s.lastIndexOf(x);
        return i === -1 ? nothing : just(i);
      };
    };
  };
};

exports["_lastIndexOf'"] = function (just) {
  return function (nothing) {
    return function (x) {
      return function (startAt) {
        return function (s) {
          if (startAt < 0 || startAt > s.length) return nothing;
          var i = s.lastIndexOf(x, startAt);
          return i === -1 ? nothing : just(i);
        };
      };
    };
  };
};

exports.length = function (s) {
  return s.length;
};

exports._localeCompare = function (lt) {
  return function (eq) {
    return function (gt) {
      return function (s1) {
        return function (s2) {
          var result = s1.localeCompare(s2);
          return result < 0 ? lt : result > 0 ? gt : eq;
        };
      };
    };
  };
};

exports.replace = function (s1) {
  return function (s2) {
    return function (s3) {
      return s3.replace(s1, s2);
    };
  };
};

exports.take = function (n) {
  return function (s) {
    return s.substr(0, n);
  };
};

exports.drop = function (n) {
  return function (s) {
    return s.substring(n);
  };
};

exports.count = function (p) {
  return function (s) {
    for (var i = 0; i < s.length && p(s.charAt(i)); i++); {}
    return i;
  };
};

exports.split = function (sep) {
  return function (s) {
    return s.split(sep);
  };
};

exports.toCharArray = function (s) {
  return s.split("");
};

exports.toLower = function (s) {
  return s.toLowerCase();
};

exports.toUpper = function (s) {
  return s.toUpperCase();
};

exports.trim = function (s) {
  return s.trim();
};

exports.joinWith = function (s) {
  return function (xs) {
    return xs.join(s);
  };
};

},{}],129:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Prelude = require("../Prelude");
var Data_Maybe = require("../Data.Maybe");
var Data_String_Unsafe = require("../Data.String.Unsafe");
var Data_Semiring = require("../Data.Semiring");
var Data_Eq = require("../Data.Eq");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Function = require("../Data.Function");
var uncons = function (v) {
    if (v === "") {
        return Data_Maybe.Nothing.value;
    };
    return new Data_Maybe.Just({
        head: Data_String_Unsafe.charAt(0)(v), 
        tail: $foreign.drop(1)(v)
    });
};
var toChar = $foreign._toChar(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var takeWhile = function (p) {
    return function (s) {
        return $foreign.take($foreign.count(p)(s))(s);
    };
};
var $$null = function (s) {
    return $foreign.length(s) === 0;
};
var localeCompare = $foreign._localeCompare(Data_Ordering.LT.value)(Data_Ordering.EQ.value)(Data_Ordering.GT.value);
var lastIndexOf$prime = $foreign["_lastIndexOf'"](Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var lastIndexOf = $foreign._lastIndexOf(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var stripSuffix = function (suffix) {
    return function (str) {
        var $2 = lastIndexOf(suffix)(str);
        if ($2 instanceof Data_Maybe.Just && $2.value0 === $foreign.length(str) - $foreign.length(suffix)) {
            return Data_Function.apply(Data_Maybe.Just.create)($foreign.take($2.value0)(str));
        };
        return Data_Maybe.Nothing.value;
    };
};
var indexOf$prime = $foreign["_indexOf'"](Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var indexOf = $foreign._indexOf(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var stripPrefix = function (prefix) {
    return function (str) {
        var $4 = indexOf(prefix)(str);
        if ($4 instanceof Data_Maybe.Just && $4.value0 === 0) {
            return Data_Function.apply(Data_Maybe.Just.create)($foreign.drop($foreign.length(prefix))(str));
        };
        return Data_Maybe.Nothing.value;
    };
};
var dropWhile = function (p) {
    return function (s) {
        return $foreign.drop($foreign.count(p)(s))(s);
    };
};
var contains = function (x) {
    return function (s) {
        return Data_Maybe.isJust(indexOf(x)(s));
    };
};
var charCodeAt = $foreign._charCodeAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
var charAt = $foreign._charAt(Data_Maybe.Just.create)(Data_Maybe.Nothing.value);
module.exports = {
    charAt: charAt, 
    charCodeAt: charCodeAt, 
    contains: contains, 
    dropWhile: dropWhile, 
    indexOf: indexOf, 
    "indexOf'": indexOf$prime, 
    lastIndexOf: lastIndexOf, 
    "lastIndexOf'": lastIndexOf$prime, 
    localeCompare: localeCompare, 
    "null": $$null, 
    stripPrefix: stripPrefix, 
    stripSuffix: stripSuffix, 
    takeWhile: takeWhile, 
    toChar: toChar, 
    uncons: uncons, 
    count: $foreign.count, 
    drop: $foreign.drop, 
    fromCharArray: $foreign.fromCharArray, 
    joinWith: $foreign.joinWith, 
    length: $foreign.length, 
    replace: $foreign.replace, 
    singleton: $foreign.singleton, 
    split: $foreign.split, 
    take: $foreign.take, 
    toCharArray: $foreign.toCharArray, 
    toLower: $foreign.toLower, 
    toUpper: $foreign.toUpper, 
    trim: $foreign.trim
};

},{"../Data.Eq":81,"../Data.Function":91,"../Data.Maybe":104,"../Data.Ordering":117,"../Data.Ring":119,"../Data.Semiring":123,"../Data.String.Unsafe":127,"../Prelude":144,"./foreign":128}],130:[function(require,module,exports){
"use strict";

// module Data.Traversable

// jshint maxparams: 3

exports.traverseArrayImpl = function () {
  function Cont(fn) {
    this.fn = fn;
  }

  var emptyList = {};

  var ConsCell = function (head, tail) {
    this.head = head;
    this.tail = tail;
  };

  function consList(x) {
    return function (xs) {
      return new ConsCell(x, xs);
    };
  }

  function listToArray(list) {
    var arr = [];
    while (list !== emptyList) {
      arr.push(list.head);
      list = list.tail;
    }
    return arr;
  }

  return function (apply) {
    return function (map) {
      return function (pure) {
        return function (f) {
          var buildFrom = function (x, ys) {
            return apply(map(consList)(f(x)))(ys);
          };

          var go = function (acc, currentLen, xs) {
            if (currentLen === 0) {
              return acc;
            } else {
              var last = xs[currentLen - 1];
              return new Cont(function () {
                return go(buildFrom(last, acc), currentLen - 1, xs);
              });
            }
          };

          return function (array) {
            var result = go(pure(emptyList), array.length, array);
            while (result instanceof Cont) {
              result = result.fn();
            }

            return map(listToArray)(result);
          };
        };
      };
    };
  };
}();

},{}],131:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Category = require("../Control.Category");
var Data_Foldable = require("../Data.Foldable");
var Data_Functor = require("../Data.Functor");
var Data_Maybe = require("../Data.Maybe");
var Data_Maybe_First = require("../Data.Maybe.First");
var Data_Maybe_Last = require("../Data.Maybe.Last");
var Data_Monoid_Additive = require("../Data.Monoid.Additive");
var Data_Monoid_Conj = require("../Data.Monoid.Conj");
var Data_Monoid_Disj = require("../Data.Monoid.Disj");
var Data_Monoid_Dual = require("../Data.Monoid.Dual");
var Data_Monoid_Multiplicative = require("../Data.Monoid.Multiplicative");
var StateL = function (x) {
    return x;
};
var StateR = function (x) {
    return x;
};
var Traversable = function (__superclass_Data$dotFoldable$dotFoldable_1, __superclass_Data$dotFunctor$dotFunctor_0, sequence, traverse) {
    this["__superclass_Data.Foldable.Foldable_1"] = __superclass_Data$dotFoldable$dotFoldable_1;
    this["__superclass_Data.Functor.Functor_0"] = __superclass_Data$dotFunctor$dotFunctor_0;
    this.sequence = sequence;
    this.traverse = traverse;
};
var traverse = function (dict) {
    return dict.traverse;
};
var traversableMultiplicative = new Traversable(function () {
    return Data_Foldable.foldableMultiplicative;
}, function () {
    return Data_Monoid_Multiplicative.functorMultiplicative;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Multiplicative.Multiplicative)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Multiplicative.Multiplicative)(f(v));
        };
    };
});
var traversableMaybe = new Traversable(function () {
    return Data_Foldable.foldableMaybe;
}, function () {
    return Data_Maybe.functorMaybe;
}, function (dictApplicative) {
    return function (v) {
        if (v instanceof Data_Maybe.Nothing) {
            return Control_Applicative.pure(dictApplicative)(Data_Maybe.Nothing.value);
        };
        if (v instanceof Data_Maybe.Just) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe.Just.create)(v.value0);
        };
        throw new Error("Failed pattern match at Data.Traversable line 88, column 3 - line 88, column 35: " + [ v.constructor.name ]);
    };
}, function (dictApplicative) {
    return function (v) {
        return function (v1) {
            if (v1 instanceof Data_Maybe.Nothing) {
                return Control_Applicative.pure(dictApplicative)(Data_Maybe.Nothing.value);
            };
            if (v1 instanceof Data_Maybe.Just) {
                return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe.Just.create)(v(v1.value0));
            };
            throw new Error("Failed pattern match at Data.Traversable line 86, column 3 - line 86, column 37: " + [ v.constructor.name, v1.constructor.name ]);
        };
    };
});
var traversableDual = new Traversable(function () {
    return Data_Foldable.foldableDual;
}, function () {
    return Data_Monoid_Dual.functorDual;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Dual.Dual)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Dual.Dual)(f(v));
        };
    };
});
var traversableDisj = new Traversable(function () {
    return Data_Foldable.foldableDisj;
}, function () {
    return Data_Monoid_Disj.functorDisj;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Disj.Disj)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Disj.Disj)(f(v));
        };
    };
});
var traversableConj = new Traversable(function () {
    return Data_Foldable.foldableConj;
}, function () {
    return Data_Monoid_Conj.functorConj;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Conj.Conj)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Conj.Conj)(f(v));
        };
    };
});
var traversableAdditive = new Traversable(function () {
    return Data_Foldable.foldableAdditive;
}, function () {
    return Data_Monoid_Additive.functorAdditive;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Additive.Additive)(v);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Monoid_Additive.Additive)(f(v));
        };
    };
});
var stateR = function (v) {
    return v;
};
var stateL = function (v) {
    return v;
};
var sequenceDefault = function (dictTraversable) {
    return function (dictApplicative) {
        return function (tma) {
            return traverse(dictTraversable)(dictApplicative)(Control_Category.id(Control_Category.categoryFn))(tma);
        };
    };
};
var traversableArray = new Traversable(function () {
    return Data_Foldable.foldableArray;
}, function () {
    return Data_Functor.functorArray;
}, function (dictApplicative) {
    return sequenceDefault(traversableArray)(dictApplicative);
}, function (dictApplicative) {
    return $foreign.traverseArrayImpl(Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]()))(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]()))(Control_Applicative.pure(dictApplicative));
});
var sequence = function (dict) {
    return dict.sequence;
};
var traversableFirst = new Traversable(function () {
    return Data_Foldable.foldableFirst;
}, function () {
    return Data_Maybe_First.functorFirst;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe_First.First)(sequence(traversableMaybe)(dictApplicative)(v));
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe_First.First)(traverse(traversableMaybe)(dictApplicative)(f)(v));
        };
    };
});
var traversableLast = new Traversable(function () {
    return Data_Foldable.foldableLast;
}, function () {
    return Data_Maybe_Last.functorLast;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe_Last.Last)(sequence(traversableMaybe)(dictApplicative)(v));
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Data_Maybe_Last.Last)(traverse(traversableMaybe)(dictApplicative)(f)(v));
        };
    };
});
var traverseDefault = function (dictTraversable) {
    return function (dictApplicative) {
        return function (f) {
            return function (ta) {
                return sequence(dictTraversable)(dictApplicative)(Data_Functor.map(dictTraversable["__superclass_Data.Functor.Functor_0"]())(f)(ta));
            };
        };
    };
};
var functorStateR = new Data_Functor.Functor(function (f) {
    return function (k) {
        return function (s) {
            var $75 = stateR(k)(s);
            return {
                accum: $75.accum, 
                value: f($75.value)
            };
        };
    };
});
var functorStateL = new Data_Functor.Functor(function (f) {
    return function (k) {
        return function (s) {
            var $78 = stateL(k)(s);
            return {
                accum: $78.accum, 
                value: f($78.value)
            };
        };
    };
});
var $$for = function (dictApplicative) {
    return function (dictTraversable) {
        return function (x) {
            return function (f) {
                return traverse(dictTraversable)(dictApplicative)(f)(x);
            };
        };
    };
};
var applyStateR = new Control_Apply.Apply(function () {
    return functorStateR;
}, function (f) {
    return function (x) {
        return function (s) {
            var $81 = stateR(x)(s);
            var $82 = stateR(f)($81.accum);
            return {
                accum: $82.accum, 
                value: $82.value($81.value)
            };
        };
    };
});
var applyStateL = new Control_Apply.Apply(function () {
    return functorStateL;
}, function (f) {
    return function (x) {
        return function (s) {
            var $87 = stateL(f)(s);
            var $88 = stateL(x)($87.accum);
            return {
                accum: $88.accum, 
                value: $87.value($88.value)
            };
        };
    };
});
var applicativeStateR = new Control_Applicative.Applicative(function () {
    return applyStateR;
}, function (a) {
    return function (s) {
        return {
            accum: s, 
            value: a
        };
    };
});
var mapAccumR = function (dictTraversable) {
    return function (f) {
        return function (s0) {
            return function (xs) {
                return stateR(traverse(dictTraversable)(applicativeStateR)(function (a) {
                    return function (s) {
                        return f(s)(a);
                    };
                })(xs))(s0);
            };
        };
    };
};
var scanr = function (dictTraversable) {
    return function (f) {
        return function (b0) {
            return function (xs) {
                return (mapAccumR(dictTraversable)(function (b) {
                    return function (a) {
                        var b$prime = f(a)(b);
                        return {
                            accum: b$prime, 
                            value: b$prime
                        };
                    };
                })(b0)(xs)).value;
            };
        };
    };
};
var applicativeStateL = new Control_Applicative.Applicative(function () {
    return applyStateL;
}, function (a) {
    return function (s) {
        return {
            accum: s, 
            value: a
        };
    };
});
var mapAccumL = function (dictTraversable) {
    return function (f) {
        return function (s0) {
            return function (xs) {
                return stateL(traverse(dictTraversable)(applicativeStateL)(function (a) {
                    return function (s) {
                        return f(s)(a);
                    };
                })(xs))(s0);
            };
        };
    };
};
var scanl = function (dictTraversable) {
    return function (f) {
        return function (b0) {
            return function (xs) {
                return (mapAccumL(dictTraversable)(function (b) {
                    return function (a) {
                        var b$prime = f(b)(a);
                        return {
                            accum: b$prime, 
                            value: b$prime
                        };
                    };
                })(b0)(xs)).value;
            };
        };
    };
};
module.exports = {
    Traversable: Traversable, 
    "for": $$for, 
    mapAccumL: mapAccumL, 
    mapAccumR: mapAccumR, 
    scanl: scanl, 
    scanr: scanr, 
    sequence: sequence, 
    sequenceDefault: sequenceDefault, 
    traverse: traverse, 
    traverseDefault: traverseDefault, 
    traversableArray: traversableArray, 
    traversableMaybe: traversableMaybe, 
    traversableFirst: traversableFirst, 
    traversableLast: traversableLast, 
    traversableAdditive: traversableAdditive, 
    traversableDual: traversableDual, 
    traversableConj: traversableConj, 
    traversableDisj: traversableDisj, 
    traversableMultiplicative: traversableMultiplicative
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Category":21,"../Data.Foldable":86,"../Data.Functor":94,"../Data.Maybe":104,"../Data.Maybe.First":102,"../Data.Maybe.Last":103,"../Data.Monoid.Additive":105,"../Data.Monoid.Conj":106,"../Data.Monoid.Disj":107,"../Data.Monoid.Dual":108,"../Data.Monoid.Multiplicative":110,"./foreign":130}],132:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_Tuple = require("../Data.Tuple");
var uncurry9 = function (f$prime) {
    return function (v) {
        return f$prime(v.value0.value0.value0.value0.value0.value0.value0.value0)(v.value0.value0.value0.value0.value0.value0.value0.value1)(v.value0.value0.value0.value0.value0.value0.value1)(v.value0.value0.value0.value0.value0.value1)(v.value0.value0.value0.value0.value1)(v.value0.value0.value0.value1)(v.value0.value0.value1)(v.value0.value1)(v.value1);
    };
};
var uncurry8 = function (f$prime) {
    return function (v) {
        return f$prime(v.value0.value0.value0.value0.value0.value0.value0)(v.value0.value0.value0.value0.value0.value0.value1)(v.value0.value0.value0.value0.value0.value1)(v.value0.value0.value0.value0.value1)(v.value0.value0.value0.value1)(v.value0.value0.value1)(v.value0.value1)(v.value1);
    };
};
var uncurry7 = function (f$prime) {
    return function (v) {
        return f$prime(v.value0.value0.value0.value0.value0.value0)(v.value0.value0.value0.value0.value0.value1)(v.value0.value0.value0.value0.value1)(v.value0.value0.value0.value1)(v.value0.value0.value1)(v.value0.value1)(v.value1);
    };
};
var uncurry6 = function (f$prime) {
    return function (v) {
        return f$prime(v.value0.value0.value0.value0.value0)(v.value0.value0.value0.value0.value1)(v.value0.value0.value0.value1)(v.value0.value0.value1)(v.value0.value1)(v.value1);
    };
};
var uncurry5 = function (f) {
    return function (v) {
        return f(v.value0.value0.value0.value0)(v.value0.value0.value0.value1)(v.value0.value0.value1)(v.value0.value1)(v.value1);
    };
};
var uncurry4 = function (f) {
    return function (v) {
        return f(v.value0.value0.value0)(v.value0.value0.value1)(v.value0.value1)(v.value1);
    };
};
var uncurry3 = function (f) {
    return function (v) {
        return f(v.value0.value0)(v.value0.value1)(v.value1);
    };
};
var uncurry2 = function (f) {
    return function (v) {
        return f(v.value0)(v.value1);
    };
};
var uncurry10 = function (f$prime) {
    return function (v) {
        return f$prime(v.value0.value0.value0.value0.value0.value0.value0.value0.value0)(v.value0.value0.value0.value0.value0.value0.value0.value0.value1)(v.value0.value0.value0.value0.value0.value0.value0.value1)(v.value0.value0.value0.value0.value0.value0.value1)(v.value0.value0.value0.value0.value0.value1)(v.value0.value0.value0.value0.value1)(v.value0.value0.value0.value1)(v.value0.value0.value1)(v.value0.value1)(v.value1);
    };
};
var tuple9 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return function (f) {
                        return function (g) {
                            return function (h) {
                                return function (i) {
                                    return new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e), f), g), h), i);
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
var tuple8 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return function (f) {
                        return function (g) {
                            return function (h) {
                                return new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e), f), g), h);
                            };
                        };
                    };
                };
            };
        };
    };
};
var tuple7 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return function (f) {
                        return function (g) {
                            return new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e), f), g);
                        };
                    };
                };
            };
        };
    };
};
var tuple6 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return function (f) {
                        return new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e), f);
                    };
                };
            };
        };
    };
};
var tuple5 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e);
                };
            };
        };
    };
};
var tuple4 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d);
            };
        };
    };
};
var tuple3 = function (a) {
    return function (b) {
        return function (c) {
            return new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c);
        };
    };
};
var tuple2 = Data_Tuple.Tuple.create;
var tuple10 = function (a) {
    return function (b) {
        return function (c) {
            return function (d) {
                return function (e) {
                    return function (f) {
                        return function (g) {
                            return function (h) {
                                return function (i) {
                                    return function (j) {
                                        return new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e), f), g), h), i), j);
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
var curry9 = function (f$prime) {
    return function (a) {
        return function (b) {
            return function (c) {
                return function (d) {
                    return function (e) {
                        return function (f) {
                            return function (g) {
                                return function (h) {
                                    return function (i) {
                                        return f$prime(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e), f), g), h), i));
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
var curry8 = function (f$prime) {
    return function (a) {
        return function (b) {
            return function (c) {
                return function (d) {
                    return function (e) {
                        return function (f) {
                            return function (g) {
                                return function (h) {
                                    return f$prime(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e), f), g), h));
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
var curry7 = function (f$prime) {
    return function (a) {
        return function (b) {
            return function (c) {
                return function (d) {
                    return function (e) {
                        return function (f) {
                            return function (g) {
                                return f$prime(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e), f), g));
                            };
                        };
                    };
                };
            };
        };
    };
};
var curry6 = function (f$prime) {
    return function (a) {
        return function (b) {
            return function (c) {
                return function (d) {
                    return function (e) {
                        return function (f) {
                            return f$prime(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e), f));
                        };
                    };
                };
            };
        };
    };
};
var curry5 = function (f) {
    return function (a) {
        return function (b) {
            return function (c) {
                return function (d) {
                    return function (e) {
                        return f(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e));
                    };
                };
            };
        };
    };
};
var curry4 = function (f) {
    return function (a) {
        return function (b) {
            return function (c) {
                return function (d) {
                    return f(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d));
                };
            };
        };
    };
};
var curry3 = function (f) {
    return function (a) {
        return function (b) {
            return function (c) {
                return f(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c));
            };
        };
    };
};
var curry2 = function (f) {
    return function (a) {
        return function (b) {
            return f(new Data_Tuple.Tuple(a, b));
        };
    };
};
var curry10 = function (f$prime) {
    return function (a) {
        return function (b) {
            return function (c) {
                return function (d) {
                    return function (e) {
                        return function (f) {
                            return function (g) {
                                return function (h) {
                                    return function (i) {
                                        return function (j) {
                                            return f$prime(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(new Data_Tuple.Tuple(a, b), c), d), e), f), g), h), i), j));
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
module.exports = {
    curry10: curry10, 
    curry2: curry2, 
    curry3: curry3, 
    curry4: curry4, 
    curry5: curry5, 
    curry6: curry6, 
    curry7: curry7, 
    curry8: curry8, 
    curry9: curry9, 
    tuple10: tuple10, 
    tuple2: tuple2, 
    tuple3: tuple3, 
    tuple4: tuple4, 
    tuple5: tuple5, 
    tuple6: tuple6, 
    tuple7: tuple7, 
    tuple8: tuple8, 
    tuple9: tuple9, 
    uncurry10: uncurry10, 
    uncurry2: uncurry2, 
    uncurry3: uncurry3, 
    uncurry4: uncurry4, 
    uncurry5: uncurry5, 
    uncurry6: uncurry6, 
    uncurry7: uncurry7, 
    uncurry8: uncurry8, 
    uncurry9: uncurry9
};

},{"../Data.Tuple":133}],133:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Biapplicative = require("../Control.Biapplicative");
var Control_Biapply = require("../Control.Biapply");
var Control_Bind = require("../Control.Bind");
var Control_Comonad = require("../Control.Comonad");
var Control_Extend = require("../Control.Extend");
var Control_Lazy = require("../Control.Lazy");
var Control_Monad = require("../Control.Monad");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Bifoldable = require("../Data.Bifoldable");
var Data_Bifunctor = require("../Data.Bifunctor");
var Data_Bitraversable = require("../Data.Bitraversable");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Bounded = require("../Data.Bounded");
var Data_Eq = require("../Data.Eq");
var Data_Foldable = require("../Data.Foldable");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_Functor_Invariant = require("../Data.Functor.Invariant");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_Maybe = require("../Data.Maybe");
var Data_Maybe_First = require("../Data.Maybe.First");
var Data_Monoid = require("../Data.Monoid");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Data_Traversable = require("../Data.Traversable");
var Data_Unit = require("../Data.Unit");
var Tuple = (function () {
    function Tuple(value0, value1) {
        this.value0 = value0;
        this.value1 = value1;
    };
    Tuple.create = function (value0) {
        return function (value1) {
            return new Tuple(value0, value1);
        };
    };
    return Tuple;
})();
var uncurry = function (f) {
    return function (v) {
        return f(v.value0)(v.value1);
    };
};
var swap = function (v) {
    return new Tuple(v.value1, v.value0);
};
var snd = function (v) {
    return v.value1;
};
var showTuple = function (dictShow) {
    return function (dictShow1) {
        return new Data_Show.Show(function (v) {
            return "(Tuple " + (Data_Show.show(dictShow)(v.value0) + (" " + (Data_Show.show(dictShow1)(v.value1) + ")")));
        });
    };
};
var semiringTuple = function (dictSemiring) {
    return function (dictSemiring1) {
        return new Data_Semiring.Semiring(function (v) {
            return function (v1) {
                return new Tuple(Data_Semiring.add(dictSemiring)(v.value0)(v1.value0), Data_Semiring.add(dictSemiring1)(v.value1)(v1.value1));
            };
        }, function (v) {
            return function (v1) {
                return new Tuple(Data_Semiring.mul(dictSemiring)(v.value0)(v1.value0), Data_Semiring.mul(dictSemiring1)(v.value1)(v1.value1));
            };
        }, new Tuple(Data_Semiring.one(dictSemiring), Data_Semiring.one(dictSemiring1)), new Tuple(Data_Semiring.zero(dictSemiring), Data_Semiring.zero(dictSemiring1)));
    };
};
var semigroupoidTuple = new Control_Semigroupoid.Semigroupoid(function (v) {
    return function (v1) {
        return new Tuple(v1.value0, v.value1);
    };
});
var semigroupTuple = function (dictSemigroup) {
    return function (dictSemigroup1) {
        return new Data_Semigroup.Semigroup(function (v) {
            return function (v1) {
                return new Tuple(Data_Semigroup.append(dictSemigroup)(v.value0)(v1.value0), Data_Semigroup.append(dictSemigroup1)(v.value1)(v1.value1));
            };
        });
    };
};
var ringTuple = function (dictRing) {
    return function (dictRing1) {
        return new Data_Ring.Ring(function () {
            return semiringTuple(dictRing["__superclass_Data.Semiring.Semiring_0"]())(dictRing1["__superclass_Data.Semiring.Semiring_0"]());
        }, function (v) {
            return function (v1) {
                return new Tuple(Data_Ring.sub(dictRing)(v.value0)(v1.value0), Data_Ring.sub(dictRing1)(v.value1)(v1.value1));
            };
        });
    };
};
var monoidTuple = function (dictMonoid) {
    return function (dictMonoid1) {
        return new Data_Monoid.Monoid(function () {
            return semigroupTuple(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(dictMonoid1["__superclass_Data.Semigroup.Semigroup_0"]());
        }, new Tuple(Data_Monoid.mempty(dictMonoid), Data_Monoid.mempty(dictMonoid1)));
    };
};
var lookup = function (dictFoldable) {
    return function (dictEq) {
        return function (a) {
            return function (f) {
                return Data_Function.apply(Data_Maybe_First.runFirst)(Data_Foldable.foldMap(dictFoldable)(Data_Maybe_First.monoidFirst)(function (v) {
                    var $127 = Data_Eq.eq(dictEq)(a)(v.value0);
                    if ($127) {
                        return new Data_Maybe.Just(v.value1);
                    };
                    if (!$127) {
                        return Data_Maybe.Nothing.value;
                    };
                    throw new Error("Failed pattern match at Data.Tuple line 189, column 58 - line 189, column 93: " + [ $127.constructor.name ]);
                })(f));
            };
        };
    };
};
var heytingAlgebraTuple = function (dictHeytingAlgebra) {
    return function (dictHeytingAlgebra1) {
        return new Data_HeytingAlgebra.HeytingAlgebra(function (v) {
            return function (v1) {
                return new Tuple(Data_HeytingAlgebra.conj(dictHeytingAlgebra)(v.value0)(v1.value0), Data_HeytingAlgebra.conj(dictHeytingAlgebra1)(v.value1)(v1.value1));
            };
        }, function (v) {
            return function (v1) {
                return new Tuple(Data_HeytingAlgebra.disj(dictHeytingAlgebra)(v.value0)(v1.value0), Data_HeytingAlgebra.disj(dictHeytingAlgebra1)(v.value1)(v1.value1));
            };
        }, new Tuple(Data_HeytingAlgebra.ff(dictHeytingAlgebra), Data_HeytingAlgebra.ff(dictHeytingAlgebra1)), function (v) {
            return function (v1) {
                return new Tuple(Data_HeytingAlgebra.implies(dictHeytingAlgebra)(v.value0)(v1.value0), Data_HeytingAlgebra.implies(dictHeytingAlgebra1)(v.value1)(v1.value1));
            };
        }, function (v) {
            return new Tuple(Data_HeytingAlgebra.not(dictHeytingAlgebra)(v.value0), Data_HeytingAlgebra.not(dictHeytingAlgebra1)(v.value1));
        }, new Tuple(Data_HeytingAlgebra.tt(dictHeytingAlgebra), Data_HeytingAlgebra.tt(dictHeytingAlgebra1)));
    };
};
var functorTuple = new Data_Functor.Functor(function (f) {
    return function (v) {
        return new Tuple(v.value0, f(v.value1));
    };
});
var invariantTuple = new Data_Functor_Invariant.Invariant(Data_Functor_Invariant.imapF(functorTuple));
var fst = function (v) {
    return v.value0;
};
var lazyTuple = function (dictLazy) {
    return function (dictLazy1) {
        return new Control_Lazy.Lazy(function (f) {
            return new Tuple(Data_Function.apply(Control_Lazy.defer(dictLazy))(function (v) {
                return fst(f(Data_Unit.unit));
            }), Data_Function.apply(Control_Lazy.defer(dictLazy1))(function (v) {
                return snd(f(Data_Unit.unit));
            }));
        });
    };
};
var foldableTuple = new Data_Foldable.Foldable(function (dictMonoid) {
    return function (f) {
        return function (v) {
            return f(v.value1);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(z)(v.value1);
        };
    };
}, function (f) {
    return function (z) {
        return function (v) {
            return f(v.value1)(z);
        };
    };
});
var traversableTuple = new Data_Traversable.Traversable(function () {
    return foldableTuple;
}, function () {
    return functorTuple;
}, function (dictApplicative) {
    return function (v) {
        return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Tuple.create(v.value0))(v.value1);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (v) {
            return Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Tuple.create(v.value0))(f(v.value1));
        };
    };
});
var extendTuple = new Control_Extend.Extend(function () {
    return functorTuple;
}, function (f) {
    return function (v) {
        return new Tuple(v.value0, f(v));
    };
});
var eqTuple = function (dictEq) {
    return function (dictEq1) {
        return new Data_Eq.Eq(function (v) {
            return function (v1) {
                return Data_Eq.eq(dictEq)(v.value0)(v1.value0) && Data_Eq.eq(dictEq1)(v.value1)(v1.value1);
            };
        });
    };
};
var ordTuple = function (dictOrd) {
    return function (dictOrd1) {
        return new Data_Ord.Ord(function () {
            return eqTuple(dictOrd["__superclass_Data.Eq.Eq_0"]())(dictOrd1["__superclass_Data.Eq.Eq_0"]());
        }, function (v) {
            return function (v1) {
                var $193 = Data_Ord.compare(dictOrd)(v.value0)(v1.value0);
                if ($193 instanceof Data_Ordering.EQ) {
                    return Data_Ord.compare(dictOrd1)(v.value1)(v1.value1);
                };
                return $193;
            };
        });
    };
};
var curry = function (f) {
    return function (a) {
        return function (b) {
            return f(new Tuple(a, b));
        };
    };
};
var comonadTuple = new Control_Comonad.Comonad(function () {
    return extendTuple;
}, snd);
var commutativeRingTuple = function (dictCommutativeRing) {
    return function (dictCommutativeRing1) {
        return new Data_CommutativeRing.CommutativeRing(function () {
            return ringTuple(dictCommutativeRing["__superclass_Data.Ring.Ring_0"]())(dictCommutativeRing1["__superclass_Data.Ring.Ring_0"]());
        });
    };
};
var boundedTuple = function (dictBounded) {
    return function (dictBounded1) {
        return new Data_Bounded.Bounded(function () {
            return ordTuple(dictBounded["__superclass_Data.Ord.Ord_0"]())(dictBounded1["__superclass_Data.Ord.Ord_0"]());
        }, new Tuple(Data_Bounded.bottom(dictBounded), Data_Bounded.bottom(dictBounded1)), new Tuple(Data_Bounded.top(dictBounded), Data_Bounded.top(dictBounded1)));
    };
};
var booleanAlgebraTuple = function (dictBooleanAlgebra) {
    return function (dictBooleanAlgebra1) {
        return new Data_BooleanAlgebra.BooleanAlgebra(function () {
            return heytingAlgebraTuple(dictBooleanAlgebra["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]())(dictBooleanAlgebra1["__superclass_Data.HeytingAlgebra.HeytingAlgebra_0"]());
        });
    };
};
var bifunctorTuple = new Data_Bifunctor.Bifunctor(function (f) {
    return function (g) {
        return function (v) {
            return new Tuple(f(v.value0), g(v.value1));
        };
    };
});
var bifoldableTuple = new Data_Bifoldable.Bifoldable(function (dictMonoid) {
    return function (f) {
        return function (g) {
            return function (v) {
                return Data_Semigroup.append(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]())(f(v.value0))(g(v.value1));
            };
        };
    };
}, function (f) {
    return function (g) {
        return function (z) {
            return function (v) {
                return g(f(z)(v.value0))(v.value1);
            };
        };
    };
}, function (f) {
    return function (g) {
        return function (z) {
            return function (v) {
                return f(v.value0)(g(v.value1)(z));
            };
        };
    };
});
var bitraversableTuple = new Data_Bitraversable.Bitraversable(function () {
    return bifoldableTuple;
}, function () {
    return bifunctorTuple;
}, function (dictApplicative) {
    return function (v) {
        return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Tuple.create)(v.value0))(v.value1);
    };
}, function (dictApplicative) {
    return function (f) {
        return function (g) {
            return function (v) {
                return Control_Apply.apply(dictApplicative["__superclass_Control.Apply.Apply_0"]())(Data_Functor.map((dictApplicative["__superclass_Control.Apply.Apply_0"]())["__superclass_Data.Functor.Functor_0"]())(Tuple.create)(f(v.value0)))(g(v.value1));
            };
        };
    };
});
var biapplyTuple = new Control_Biapply.Biapply(function () {
    return bifunctorTuple;
}, function (v) {
    return function (v1) {
        return new Tuple(v.value0(v1.value0), v.value1(v1.value1));
    };
});
var biapplicativeTuple = new Control_Biapplicative.Biapplicative(function () {
    return biapplyTuple;
}, Tuple.create);
var applyTuple = function (dictSemigroup) {
    return new Control_Apply.Apply(function () {
        return functorTuple;
    }, function (v) {
        return function (v1) {
            return new Tuple(Data_Semigroup.append(dictSemigroup)(v.value0)(v1.value0), v.value1(v1.value1));
        };
    });
};
var bindTuple = function (dictSemigroup) {
    return new Control_Bind.Bind(function () {
        return applyTuple(dictSemigroup);
    }, function (v) {
        return function (f) {
            var $242 = f(v.value1);
            return new Tuple(Data_Semigroup.append(dictSemigroup)(v.value0)($242.value0), $242.value1);
        };
    });
};
var applicativeTuple = function (dictMonoid) {
    return new Control_Applicative.Applicative(function () {
        return applyTuple(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    }, Tuple.create(Data_Monoid.mempty(dictMonoid)));
};
var monadTuple = function (dictMonoid) {
    return new Control_Monad.Monad(function () {
        return applicativeTuple(dictMonoid);
    }, function () {
        return bindTuple(dictMonoid["__superclass_Data.Semigroup.Semigroup_0"]());
    });
};
module.exports = {
    Tuple: Tuple, 
    curry: curry, 
    fst: fst, 
    lookup: lookup, 
    snd: snd, 
    swap: swap, 
    uncurry: uncurry, 
    showTuple: showTuple, 
    eqTuple: eqTuple, 
    ordTuple: ordTuple, 
    boundedTuple: boundedTuple, 
    semigroupoidTuple: semigroupoidTuple, 
    semigroupTuple: semigroupTuple, 
    monoidTuple: monoidTuple, 
    semiringTuple: semiringTuple, 
    ringTuple: ringTuple, 
    commutativeRingTuple: commutativeRingTuple, 
    heytingAlgebraTuple: heytingAlgebraTuple, 
    booleanAlgebraTuple: booleanAlgebraTuple, 
    functorTuple: functorTuple, 
    invariantTuple: invariantTuple, 
    bifunctorTuple: bifunctorTuple, 
    applyTuple: applyTuple, 
    biapplyTuple: biapplyTuple, 
    applicativeTuple: applicativeTuple, 
    biapplicativeTuple: biapplicativeTuple, 
    bindTuple: bindTuple, 
    monadTuple: monadTuple, 
    extendTuple: extendTuple, 
    comonadTuple: comonadTuple, 
    lazyTuple: lazyTuple, 
    foldableTuple: foldableTuple, 
    bifoldableTuple: bifoldableTuple, 
    traversableTuple: traversableTuple, 
    bitraversableTuple: bitraversableTuple
};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Biapplicative":17,"../Control.Biapply":18,"../Control.Bind":20,"../Control.Comonad":22,"../Control.Extend":25,"../Control.Lazy":26,"../Control.Monad":61,"../Control.Semigroupoid":66,"../Data.Bifoldable":70,"../Data.Bifunctor":71,"../Data.Bitraversable":72,"../Data.BooleanAlgebra":74,"../Data.Bounded":76,"../Data.CommutativeRing":77,"../Data.Eq":81,"../Data.Foldable":86,"../Data.Function":91,"../Data.Functor":94,"../Data.Functor.Invariant":92,"../Data.HeytingAlgebra":96,"../Data.Maybe":104,"../Data.Maybe.First":102,"../Data.Monoid":111,"../Data.Ord":116,"../Data.Ordering":117,"../Data.Ring":119,"../Data.Semigroup":121,"../Data.Semiring":123,"../Data.Show":125,"../Data.Traversable":131,"../Data.Unit":135}],134:[function(require,module,exports){
"use strict";

// module Data.Unit

exports.unit = {};

},{}],135:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Data_Show = require("../Data.Show");
var showUnit = new Data_Show.Show(function (v) {
    return "unit";
});
module.exports = {
    showUnit: showUnit, 
    unit: $foreign.unit
};

},{"../Data.Show":125,"./foreign":134}],136:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Data_Show = require("../Data.Show");
var Void = function (x) {
    return x;
};
var absurd = function (a) {
    var spin = function (__copy_v) {
        var v = __copy_v;
        tco: while (true) {
            var __tco_v = v;
            v = __tco_v;
            continue tco;
        };
    };
    return spin(a);
};
var showVoid = new Data_Show.Show(absurd);
module.exports = {
    absurd: absurd, 
    showVoid: showVoid
};

},{"../Data.Show":125}],137:[function(require,module,exports){
"use strict";
var Prelude = require("../Prelude");
var Control_Monad_Eff_JQuery = require("../Control.Monad.Eff.JQuery");
var Control_Alternative = require("../Control.Alternative");
var Control_Cycle = require("../Control.Cycle");
var Control_Monad_Eff = require("../Control.Monad.Eff");
var Control_Monad_Eff_Console = require("../Control.Monad.Eff.Console");
var Control_Monad_Eff_Timer = require("../Control.Monad.Eff.Timer");
var Control_XStream = require("../Control.XStream");
var DOM = require("../DOM");
var Data_Tuple_Nested = require("../Data.Tuple.Nested");
var Data_Tuple = require("../Data.Tuple");
var Control_Plus = require("../Control.Plus");
var Data_Functor = require("../Data.Functor");
var Data_Show = require("../Data.Show");
var Data_Ord = require("../Data.Ord");
var Data_Ring = require("../Data.Ring");
var Data_Function = require("../Data.Function");
var Control_Bind = require("../Control.Bind");
var main = (function () {
    var sinks = function (timer) {
        return function (v) {
            return new Data_Tuple.Tuple(Control_Plus.empty(Control_XStream.plusStream), Data_Functor.map(Control_XStream.functorStream)(Data_Show.show(Data_Show.showInt))(timer));
        };
    };
    var drivers = new Data_Tuple.Tuple(function (v) {
        return Data_Functor.map(Control_Monad_Eff.functorEff)(Data_Functor.map(Data_Functor.functorFn)(Control_XStream.filter(function (v1) {
            return v1 > 0;
        }))(Control_XStream.startWith(-1)))(Control_XStream.periodic(1000));
    }, function (s) {
        return Data_Function.apply(Control_Monad_Eff_JQuery.ready)(function __do() {
            var v = Control_Monad_Eff_JQuery.body();
            var v1 = Control_Monad_Eff_JQuery.create("<div>")();
            var v2 = Control_Monad_Eff_JQuery.create("<h1>Periodic:</h1>")();
            var v3 = Control_Monad_Eff_JQuery.create("<h2>")();
            Control_Monad_Eff_JQuery.append(v2)(v1)();
            Control_Monad_Eff_JQuery.append(v3)(v1)();
            Control_Monad_Eff_JQuery.append(v1)(v)();
            return Control_XStream.addListener((function () {
                var $12 = {};
                for (var $13 in Control_XStream.defaultListener) {
                    if (Control_XStream.defaultListener.hasOwnProperty($13)) {
                        $12[$13] = Control_XStream.defaultListener[$13];
                    };
                };
                $12.next = function (x) {
                    return function __do() {
                        Control_Monad_Eff_Console.log(x)();
                        return Control_Monad_Eff_JQuery.setText(x)(v3)();
                    };
                };
                return $12;
            })())(s)();
        });
    });
    return Control_Cycle.run2(sinks)(drivers);
})();
module.exports = {
    main: main
};

},{"../Control.Alternative":13,"../Control.Bind":20,"../Control.Cycle":24,"../Control.Monad.Eff":47,"../Control.Monad.Eff.Console":35,"../Control.Monad.Eff.JQuery":39,"../Control.Monad.Eff.Timer":43,"../Control.Plus":65,"../Control.XStream":68,"../DOM":69,"../Data.Function":91,"../Data.Functor":94,"../Data.Ord":116,"../Data.Ring":119,"../Data.Show":125,"../Data.Tuple":133,"../Data.Tuple.Nested":132,"../Prelude":144}],138:[function(require,module,exports){
"use strict";

// module Math

exports.abs = Math.abs;

exports.acos = Math.acos;

exports.asin = Math.asin;

exports.atan = Math.atan;

exports.atan2 = function (y) {
  return function (x) {
    return Math.atan2(y, x);
  };
};

exports.ceil = Math.ceil;

exports.cos = Math.cos;

exports.exp = Math.exp;

exports.floor = Math.floor;

exports.trunc = Math.trunc || function (n) {
  return n < 0 ? Math.ceil(n) : Math.floor(n);
};

exports.log = Math.log;

exports.max = function (n1) {
  return function (n2) {
    return Math.max(n1, n2);
  };
};

exports.min = function (n1) {
  return function (n2) {
    return Math.min(n1, n2);
  };
};

exports.pow = function (n) {
  return function (p) {
    return Math.pow(n, p);
  };
};

exports.remainder = function (n) {
  return function (m) {
    return n % m;
  };
};

exports.round = Math.round;

exports.sin = Math.sin;

exports.sqrt = Math.sqrt;

exports.tan = Math.tan;

exports.e = Math.E;

exports.ln2 = Math.LN2;

exports.ln10 = Math.LN10;

exports.log2e = Math.LOG2E;

exports.log10e = Math.LOG10E;

exports.pi = Math.PI;

exports.sqrt1_2 = Math.SQRT1_2;

exports.sqrt2 = Math.SQRT2;

},{}],139:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
module.exports = {
    abs: $foreign.abs, 
    acos: $foreign.acos, 
    asin: $foreign.asin, 
    atan: $foreign.atan, 
    atan2: $foreign.atan2, 
    ceil: $foreign.ceil, 
    cos: $foreign.cos, 
    e: $foreign.e, 
    exp: $foreign.exp, 
    floor: $foreign.floor, 
    ln10: $foreign.ln10, 
    ln2: $foreign.ln2, 
    log: $foreign.log, 
    log10e: $foreign.log10e, 
    log2e: $foreign.log2e, 
    max: $foreign.max, 
    min: $foreign.min, 
    pi: $foreign.pi, 
    pow: $foreign.pow, 
    remainder: $foreign.remainder, 
    round: $foreign.round, 
    sin: $foreign.sin, 
    sqrt: $foreign.sqrt, 
    sqrt1_2: $foreign.sqrt1_2, 
    sqrt2: $foreign.sqrt2, 
    tan: $foreign.tan, 
    trunc: $foreign.trunc
};

},{"./foreign":138}],140:[function(require,module,exports){
"use strict";

// module Partial.Unsafe

exports.unsafePartial = function (f) {
  return f();
};

},{}],141:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var Partial = require("../Partial");
var unsafeCrashWith = function (msg) {
    return $foreign.unsafePartial(function (dictPartial) {
        return Partial.crashWith(dictPartial)(msg);
    });
};
module.exports = {
    unsafeCrashWith: unsafeCrashWith, 
    unsafePartial: $foreign.unsafePartial
};

},{"../Partial":143,"./foreign":140}],142:[function(require,module,exports){
"use strict";

// module Partial

exports.crashWith = function () {
  return function (msg) {
    throw new Error(msg);
  };
};

},{}],143:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
var crash = function (dictPartial) {
    return $foreign.crashWith(dictPartial)("Partial.crash: partial function");
};
module.exports = {
    crash: crash, 
    crashWith: $foreign.crashWith
};

},{"./foreign":142}],144:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var Control_Applicative = require("../Control.Applicative");
var Control_Apply = require("../Control.Apply");
var Control_Bind = require("../Control.Bind");
var Control_Category = require("../Control.Category");
var Control_Monad = require("../Control.Monad");
var Control_Semigroupoid = require("../Control.Semigroupoid");
var Data_Boolean = require("../Data.Boolean");
var Data_BooleanAlgebra = require("../Data.BooleanAlgebra");
var Data_Bounded = require("../Data.Bounded");
var Data_CommutativeRing = require("../Data.CommutativeRing");
var Data_Eq = require("../Data.Eq");
var Data_EuclideanRing = require("../Data.EuclideanRing");
var Data_Field = require("../Data.Field");
var Data_Function = require("../Data.Function");
var Data_Functor = require("../Data.Functor");
var Data_HeytingAlgebra = require("../Data.HeytingAlgebra");
var Data_NaturalTransformation = require("../Data.NaturalTransformation");
var Data_Ord = require("../Data.Ord");
var Data_Ordering = require("../Data.Ordering");
var Data_Ring = require("../Data.Ring");
var Data_Semigroup = require("../Data.Semigroup");
var Data_Semiring = require("../Data.Semiring");
var Data_Show = require("../Data.Show");
var Data_Unit = require("../Data.Unit");
var Data_Void = require("../Data.Void");
module.exports = {};

},{"../Control.Applicative":14,"../Control.Apply":16,"../Control.Bind":20,"../Control.Category":21,"../Control.Monad":61,"../Control.Semigroupoid":66,"../Data.Boolean":73,"../Data.BooleanAlgebra":74,"../Data.Bounded":76,"../Data.CommutativeRing":77,"../Data.Eq":81,"../Data.EuclideanRing":83,"../Data.Field":84,"../Data.Function":91,"../Data.Functor":94,"../Data.HeytingAlgebra":96,"../Data.NaturalTransformation":112,"../Data.Ord":116,"../Data.Ordering":117,"../Data.Ring":119,"../Data.Semigroup":121,"../Data.Semiring":123,"../Data.Show":125,"../Data.Unit":135,"../Data.Void":136}],145:[function(require,module,exports){
"use strict";

// module Unsafe.Coerce

exports.unsafeCoerce = function (x) {
  return x;
};

},{}],146:[function(require,module,exports){
// Generated by psc version 0.9.3
"use strict";
var $foreign = require("./foreign");
module.exports = {
    unsafeCoerce: $foreign.unsafeCoerce
};

},{"./foreign":145}],147:[function(require,module,exports){
require('Main').main();

},{"Main":137}]},{},[147]);
