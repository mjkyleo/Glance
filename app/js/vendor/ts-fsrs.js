var TSFSRS = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // ts-fsrs-entry.mjs
  var ts_fsrs_entry_exports = {};
  __export(ts_fsrs_entry_exports, {
    FSRS6Algorithm: () => FSRS6Algorithm,
    FSRS6Model: () => FSRS6Model,
    FSRS6_DECAY: () => FSRS6_DECAY,
    FSRS6_DEFAULT_WEIGHTS: () => FSRS6_DEFAULT_WEIGHTS,
    FSRS6_MODEL_BOUNDS: () => FSRS6_MODEL_BOUNDS,
    FSRS6_W17_W18_CEILING: () => FSRS6_W17_W18_CEILING,
    Rating: () => Rating,
    checkFSRS6Parameters: () => checkFSRS6Parameters,
    clipFSRS6Parameters: () => clipFSRS6Parameters,
    computeDecayFactor: () => computeDecayFactor,
    forgettingCurve: () => forgetting_curve
  });

  // node_modules/ts-fsrs/dist/schema-utils-DX7uVwiJ.mjs
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  function roundTo(num, decimals) {
    const factor = 10 ** decimals;
    return Math.round(num * factor) / factor;
  }
  function isObject(value) {
    return typeof value === "object" && value !== null;
  }
  function isNumberArray(value) {
    if (!Array.isArray(value)) return false;
    for (const item of value) if (typeof item !== "number" || !Number.isFinite(item)) return false;
    return true;
  }

  // node_modules/@open-spaced-repetition/srs-kit/dist/esm/schema-CgTDED3c.js
  function isObject2(value) {
    return !!value && !Array.isArray(value) && typeof value === "object";
  }
  function isFiniteNumber(value) {
    return Number.isFinite(value);
  }
  var emptyRecordPrototype = Object.freeze(/* @__PURE__ */ Object.create(null));
  function defineSchema(validate) {
    return {
      "~standard": {
        version: 1,
        vendor: "@open-spaced-repetition/srs-kit",
        validate
      },
      parse(input) {
        const result = validate(input);
        if (result.issues) throw new SRSSchemaError(result.issues);
        return result.value;
      },
      safeParse(input) {
        const result = validate(input);
        if (result.issues) return {
          success: false,
          issues: result.issues
        };
        return {
          success: true,
          data: result.value
        };
      }
    };
  }
  var SRSSchemaError = class SRSSchemaError2 extends Error {
    constructor(issues) {
      var _a;
      super(issues.map((issue) => issue.message).join("\n"));
      __publicField(this, "issues");
      this.name = "SRSSchemaError";
      this.issues = issues;
      (_a = Error == null ? void 0 : Error.captureStackTrace) == null ? void 0 : _a.call(Error, this, SRSSchemaError2);
    }
  };
  var emptyObjectSchema = defineSchema((value) => {
    if (!isObject2(value) || Object.keys(value).length > 0) return { issues: [{ message: "Expected empty object" }] };
    return { value: {} };
  });
  var numberSchema = defineSchema((value) => isFiniteNumber(value) ? { value } : { issues: [{ message: "Expected finite number" }] });
  function isValidDate(value) {
    return value instanceof Date && value.getTime() !== 0 && Number.isFinite(value.getTime());
  }
  var dateSchema = defineSchema((value) => isValidDate(value) ? { value } : { issues: [{ message: "Expected valid Date" }] });
  var desiredRetentionSchema = defineSchema((value) => isFiniteNumber(value) && value > 0 && value < 1 ? { value } : { issues: [{ message: "desiredRetention must be finite and in (0, 1)" }] });
  var elapsedDaysSchema = defineSchema((value) => isFiniteNumber(value) && value >= 0 ? { value } : { issues: [{ message: "elapsedDays must be finite and non-negative" }] });
  var scheduledDaysSchema = defineSchema((value) => isFiniteNumber(value) && value >= 0 ? { value } : { issues: [{ message: "scheduledDays must be finite and non-negative" }] });
  var fractionalDaysConfigSchema = defineSchema((value) => {
    if (!isObject2(value)) return { issues: [{ message: "Expected fractional days config" }] };
    const fractionalDays = value.fractionalDays === void 0 ? false : value.fractionalDays;
    if (typeof fractionalDays !== "boolean") return { issues: [{ message: "Expected fractionalDays to be a boolean" }] };
    return { value: { fractionalDays } };
  });

  // node_modules/@open-spaced-repetition/srs-kit/dist/esm/state-B8lS4k1a.js
  var Rating = Object.freeze({
    Manual: 0,
    Again: 1,
    Hard: 2,
    Good: 3,
    Easy: 4
  });
  var ratings = Object.freeze([
    Rating.Manual,
    Rating.Again,
    Rating.Hard,
    Rating.Good,
    Rating.Easy
  ]);
  var grades = Object.freeze([
    Rating.Again,
    Rating.Hard,
    Rating.Good,
    Rating.Easy
  ]);
  var ratingSchema = defineSchema((value) => value === Rating.Manual || value === Rating.Again || value === Rating.Hard || value === Rating.Good || value === Rating.Easy ? { value } : { issues: [{ message: "Expected rating" }] });
  var gradeSchema = defineSchema((value) => value === Rating.Again || value === Rating.Hard || value === Rating.Good || value === Rating.Easy ? { value } : { issues: [{ message: "Expected grade" }] });
  var State = Object.freeze({
    New: 0,
    Learning: 1,
    Review: 2,
    Relearning: 3
  });
  var states = Object.freeze([
    State.New,
    State.Learning,
    State.Review,
    State.Relearning
  ]);
  var stateSchema = defineSchema((value) => value === State.New || value === State.Learning || value === State.Review || value === State.Relearning ? { value } : { issues: [{ message: "Expected state" }] });

  // node_modules/@open-spaced-repetition/srs-kit/dist/esm/model/index.js
  function defineModel(definition) {
    return definition;
  }

  // node_modules/ts-fsrs/dist/schema-D7q2J7dh.mjs
  var FSRSMemoryStateSchema = defineSchema((value) => {
    if (isObject(value) && isFiniteNumber(value.stability) && isFiniteNumber(value.difficulty)) return { value: {
      stability: value.stability,
      difficulty: value.difficulty
    } };
    return { issues: [{ message: "Expected FSRS memory state" }] };
  });

  // node_modules/ts-fsrs/dist/error.mjs
  var FSRSError = class FSRSError2 extends Error {
    constructor(message = "FSRS Error") {
      var _a;
      super(message);
      this.name = "FSRSError";
      (_a = Error.captureStackTrace) == null ? void 0 : _a.call(Error, this, FSRSError2);
    }
  };
  var FSRSValidationError = class FSRSValidationError2 extends FSRSError {
    constructor(message) {
      var _a;
      super(message);
      this.name = "FSRSValidationError";
      (_a = Error.captureStackTrace) == null ? void 0 : _a.call(Error, this, FSRSValidationError2);
    }
  };

  // node_modules/ts-fsrs/dist/constants-YU7EeO-L.mjs
  var FSRS5_DECAY = 0.5;
  var FSRS5_FACTOR = 19 / 81;
  var FSRS5_MODEL_BOUNDS = Object.freeze({
    sMin: 0.01,
    sMax: 36500,
    dMin: 1,
    dMax: 10
  });
  var FSRS5_DEFAULT_WEIGHTS = Object.freeze([
    0.40255,
    1.18385,
    3.173,
    15.69105,
    7.1949,
    0.5345,
    1.4604,
    46e-4,
    1.54575,
    0.1192,
    1.01925,
    1.9395,
    0.11,
    0.29605,
    2.2698,
    0.2315,
    2.9898,
    0.51655,
    0.6621
  ]);

  // node_modules/ts-fsrs/dist/fsrs-6-Bt0f3F6X.mjs
  var FSRS6_DECAY = 0.1542;
  var FSRS6_W17_W18_CEILING = 2;
  var FSRS6_MODEL_BOUNDS = Object.freeze({
    sMin: 1e-3,
    sMax: 36500,
    dMin: 1,
    dMax: 10
  });
  var FSRS6_DEFAULT_WEIGHTS = Object.freeze([
    0.212,
    1.2931,
    2.3065,
    8.2956,
    6.4133,
    0.8334,
    3.0194,
    1e-3,
    1.8722,
    0.1666,
    0.796,
    1.4835,
    0.0614,
    0.2629,
    1.6483,
    0.6014,
    1.8729,
    0.5425,
    0.0912,
    0.0658,
    FSRS6_DECAY
  ]);
  var FSRS6ParameterBounds = (w17W18Ceiling, enableShortTerm = true) => [
    [FSRS6_MODEL_BOUNDS.sMin, 100],
    [FSRS6_MODEL_BOUNDS.sMin, 100],
    [FSRS6_MODEL_BOUNDS.sMin, 100],
    [FSRS6_MODEL_BOUNDS.sMin, 100],
    [FSRS6_MODEL_BOUNDS.dMin, FSRS6_MODEL_BOUNDS.dMax],
    [1e-3, 4],
    [1e-3, 4],
    [1e-3, 0.75],
    [0, 4.5],
    [0, 0.8],
    [1e-3, 3.5],
    [1e-3, 5],
    [1e-3, 0.25],
    [1e-3, 0.9],
    [0, 4],
    [0, 1],
    [1, 6],
    [0, w17W18Ceiling],
    [0, w17W18Ceiling],
    [enableShortTerm ? 0.01 : 0, 0.8],
    [0.1, 0.8]
  ];
  var decaySchema = defineSchema((value) => typeof value === "number" && value >= 0.1 && value <= 0.8 ? { value } : { issues: [{ message: "Expected decay between 0.1 and 0.8" }] });
  var clipFSRS6Parameters = (parameters, numRelearningSteps = 0, enableShortTerm = true) => {
    const clip = FSRS6ParameterBounds(2, enableShortTerm).slice(0, parameters.length);
    if (Math.max(0, numRelearningSteps) > 1 && parameters.length >= 19) {
      const w11 = clamp(parameters[11] || 0, clip[11][0], clip[11][1]);
      const w13 = clamp(parameters[13] || 0, clip[13][0], clip[13][1]);
      const w14 = clamp(parameters[14] || 0, clip[14][0], clip[14][1]);
      const value = -(Math.log(w11) + Math.log(Math.pow(2, w13) - 1) + w14 * 0.3) / numRelearningSteps;
      const w17W18Ceiling = clamp(roundTo(Math.sqrt(Math.max(value, 0)), 8), 0.01, 2);
      clip[17] = [clip[17][0], w17W18Ceiling];
      clip[18] = [clip[18][0], w17W18Ceiling];
    }
    return clip.map(([min, max], index) => clamp(parameters[index] || 0, min, max));
  };
  var checkFSRS6Parameters = (parameters, numRelearningSteps = 0, enableShortTerm = true) => {
    const clipped = clipFSRS6Parameters(Array.from(parameters), numRelearningSteps, enableShortTerm);
    if (!(parameters.length === FSRS6_DEFAULT_WEIGHTS.length && clipped.every((value, index) => value === parameters[index]))) throw new FSRSValidationError("Expected FSRS6 weights within model bounds.");
    return parameters;
  };
  var migrateFSRS6Parameters = (parameters) => {
    if (!Array.isArray(parameters) || parameters.length === 0) return [...FSRS6_DEFAULT_WEIGHTS];
    switch (parameters.length) {
      case 21:
        return Array.from(parameters);
      case 19:
        return Array.from(parameters).concat([0, FSRS5_DECAY]);
      case 17: {
        const weights = Array.from(parameters);
        weights[4] = +(weights[5] * 2 + weights[4]).toFixed(8);
        weights[5] = +(Math.log(weights[5] * 3 + 1) / 3).toFixed(8);
        weights[6] = +(weights[6] + 0.5).toFixed(8);
        return weights.concat([
          0,
          0,
          0,
          FSRS5_DECAY
        ]);
      }
      default:
        throw new FSRSValidationError(`Invalid parameters length "${parameters.length}", expected 17, 19 or 21.`);
    }
  };
  var fsrs6ConfigSchema = defineSchema((value) => {
    if (isObject2(value) && isNumberArray(value.weights) && typeof value.enableShortTerm === "boolean" && typeof value.numRelearningSteps === "number" && Number.isSafeInteger(value.numRelearningSteps) && value.numRelearningSteps >= 0) return { value: {
      weights: value.weights,
      enableShortTerm: value.enableShortTerm,
      numRelearningSteps: value.numRelearningSteps
    } };
    return { issues: [{ message: "Expected FSRS6 config" }] };
  });
  var computeDecayFactor = (decayOrParams) => {
    const decay = typeof decayOrParams === "number" ? -decayOrParams : -decayOrParams[20];
    const factor = Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1;
    return {
      decay,
      factor: roundTo(factor, 8)
    };
  };
  function forgetting_curve(decayOrParams, elapsed_days, stability) {
    const { decay, factor } = computeDecayFactor(decayOrParams);
    return roundTo(Math.pow(1 + factor * elapsed_days / stability, decay), 8);
  }
  var FSRS6Algorithm = class {
    constructor(weights, enableShortTerm, bounds) {
      __publicField(this, "weights");
      __publicField(this, "enableShortTerm");
      __publicField(this, "bounds");
      __publicField(this, "decayWeight", NaN);
      __publicField(this, "decay", 0);
      __publicField(this, "factor", 0);
      __publicField(this, "forgetting_curve");
      this.weights = weights;
      this.enableShortTerm = enableShortTerm;
      this.bounds = bounds;
      if (!Array.isArray(weights) || weights.length !== 21) throw new FSRSValidationError(`FSRS6Algorithm requires exactly 21 weights, but received ${weights == null ? void 0 : weights.length}`);
      this.forgetting_curve = (elapsed_days, stability) => {
        const { decay, factor } = this.getDecayFactor();
        return roundTo(Math.pow(1 + factor * elapsed_days / stability, decay), 8);
      };
    }
    getDecayFactor() {
      const decayWeight = this.weights[20];
      if (decayWeight !== this.decayWeight) {
        const { decay, factor } = computeDecayFactor(decayWeight);
        this.decayWeight = decayWeight;
        this.decay = decay;
        this.factor = factor;
      }
      return {
        decay: this.decay,
        factor: this.factor
      };
    }
    init_stability(g) {
      return clamp(this.weights[g - 1], this.bounds.sMin, this.bounds.sMax);
    }
    init_difficulty(g) {
      const w = this.weights;
      const d = w[4] - Math.exp((g - 1) * w[5]) + 1;
      return roundTo(d, 8);
    }
    next_interval(s, desired_retention) {
      if (!Number.isFinite(desired_retention) || desired_retention <= 0 || desired_retention > 1) throw new FSRSValidationError("Desired retention rate should be in the range (0,1]");
      const { decay, factor } = this.getDecayFactor();
      return Math.max(Math.round(s / factor * (Math.pow(desired_retention, 1 / decay) - 1)), 1);
    }
    /**
    * @see https://github.com/open-spaced-repetition/fsrs4anki/issues/697
    */
    linear_damping(delta_d, old_d) {
      return roundTo(delta_d * (10 - old_d) / 9, 8);
    }
    next_difficulty(d, g) {
      const delta_d = -this.weights[6] * (g - 3);
      const next_d = d + this.linear_damping(delta_d, d);
      return clamp(this.mean_reversion(this.init_difficulty(Rating.Easy), next_d), 1, 10);
    }
    mean_reversion(init, current) {
      const w = this.weights;
      return roundTo(w[7] * init + (1 - w[7]) * current, 8);
    }
    next_recall_stability(d, s, r, g) {
      const w = this.weights;
      const hard_penalty = Rating.Hard === g ? w[15] : 1;
      const easy_bound = Rating.Easy === g ? w[16] : 1;
      return roundTo(clamp(s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hard_penalty * easy_bound), this.bounds.sMin, this.bounds.sMax), 8);
    }
    next_forget_stability(d, s, r) {
      const w = this.weights;
      return roundTo(clamp(w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]), this.bounds.sMin, this.bounds.sMax), 8);
    }
    next_short_term_stability(s, g) {
      const w = this.weights;
      const sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (g - 3 + w[18]));
      const maskedSinc = g >= Rating.Hard ? Math.max(sinc, 1) : sinc;
      return roundTo(clamp(s * maskedSinc, this.bounds.sMin, this.bounds.sMax), 8);
    }
    next_state(memory_state, t, g, r) {
      const { difficulty: d, stability: s } = memory_state != null ? memory_state : {
        difficulty: 0,
        stability: 0
      };
      if (t < 0) throw new FSRSValidationError(`Invalid delta_t "${t}"`);
      if (g < 0 || g > 4) throw new FSRSValidationError(`Invalid grade "${g}"`);
      if (g === Rating.Manual) return {
        difficulty: d,
        stability: s
      };
      const grade = g;
      if (d === 0 && s === 0) return {
        difficulty: clamp(this.init_difficulty(grade), 1, 10),
        stability: this.init_stability(grade)
      };
      if (d < 1 || s < this.bounds.sMin) throw new FSRSValidationError(`Invalid memory state { difficulty: ${d}, stability: ${s} }`);
      const w = this.weights;
      r = typeof r === "number" ? r : this.forgetting_curve(t, s);
      let new_s;
      if (t === 0 && this.enableShortTerm) new_s = this.next_short_term_stability(s, grade);
      else if (g === 1) {
        const s_after_fail = this.next_forget_stability(d, s, r);
        let [w_17, w_18] = [0, 0];
        if (this.enableShortTerm) {
          w_17 = w[17];
          w_18 = w[18];
        }
        const next_s_min = s / Math.exp(w_17 * w_18);
        new_s = clamp(roundTo(next_s_min, 8), this.bounds.sMin, s_after_fail);
      } else new_s = this.next_recall_stability(d, s, r, grade);
      return {
        difficulty: this.next_difficulty(d, grade),
        stability: new_s
      };
    }
  };
  var createFSRS6Model = (config) => {
    const bounds = FSRS6_MODEL_BOUNDS;
    const algo = new FSRS6Algorithm(config.weights, config.enableShortTerm, FSRS6_MODEL_BOUNDS);
    const step = ({ memoryState, rating, elapsedDays, retrievability }) => {
      return algo.next_state(memoryState, elapsedDays, rating, retrievability);
    };
    const nextInterval = (memoryState, desiredRetention) => {
      return algo.next_interval(memoryState.stability, desiredRetention);
    };
    const forgettingCurve = (memoryState, elapsedDays) => {
      return algo.forgetting_curve(elapsedDays, memoryState.stability);
    };
    const forward = ({ history, initialState }) => {
      const states2 = [];
      let memoryState = initialState || null;
      for (const review of history) {
        memoryState = step({
          memoryState,
          rating: review.rating,
          elapsedDays: review.deltaT
        });
        states2.push(memoryState);
      }
      return states2;
    };
    return {
      config,
      bounds,
      algorithm: algo,
      step,
      nextInterval,
      forgettingCurve,
      forward
    };
  };
  var FSRS6Model = defineModel({
    name: "fsrs-6",
    schema: {
      config: fsrs6ConfigSchema,
      memoryState: FSRSMemoryStateSchema
    },
    defaultValue: { memoryState() {
      return {
        stability: 0,
        difficulty: 0
      };
    } },
    create({ config, migrate = true, clip = true, check = true, bypass = false }) {
      if (bypass) return createFSRS6Model(config);
      let weights = migrate ? migrateFSRS6Parameters(config.weights) : config.weights;
      if (clip && Array.isArray(weights)) weights = clipFSRS6Parameters(weights, config.numRelearningSteps, config.enableShortTerm);
      if (check) checkFSRS6Parameters(weights, config.numRelearningSteps, config.enableShortTerm);
      const $config = fsrs6ConfigSchema.parse({
        weights,
        enableShortTerm: config.enableShortTerm,
        numRelearningSteps: config.numRelearningSteps
      });
      return createFSRS6Model(Object.freeze($config));
    }
  });
  return __toCommonJS(ts_fsrs_entry_exports);
})();
