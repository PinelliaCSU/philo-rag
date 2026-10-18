true              &&(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
}());

const node_env = globalThis.process?.env?.NODE_ENV;
const DEV = node_env && !node_env.toLowerCase().startsWith('prod');

// Store the references to globals in case someone tries to monkey patch these, causing the below
// to de-opt (this occurs often when using popular extensions).
var is_array = Array.isArray;
var index_of = Array.prototype.indexOf;
var includes = Array.prototype.includes;
var array_from = Array.from;
var define_property = Object.defineProperty;
var get_descriptor = Object.getOwnPropertyDescriptor;
var get_descriptors = Object.getOwnPropertyDescriptors;
var object_prototype = Object.prototype;
var array_prototype = Array.prototype;
var get_prototype_of = Object.getPrototypeOf;
var is_extensible = Object.isExtensible;

const noop = () => {};

/** @param {Function} fn */
function run(fn) {
	return fn();
}

/** @param {Array<() => void>} arr */
function run_all(arr) {
	for (var i = 0; i < arr.length; i++) {
		arr[i]();
	}
}

/**
 * TODO replace with Promise.withResolvers once supported widely enough
 * @template [T=void]
 */
function deferred() {
	/** @type {(value: T) => void} */
	var resolve;

	/** @type {(reason: any) => void} */
	var reject;

	/** @type {Promise<T>} */
	var promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});

	// @ts-expect-error
	return { promise, resolve, reject };
}

// General flags
const DERIVED = 1 << 1;
const EFFECT = 1 << 2;
const RENDER_EFFECT = 1 << 3;
/**
 * An effect that does not destroy its child effects when it reruns.
 * Runs as part of render effects, i.e. not eagerly as part of tree traversal or effect flushing.
 */
const MANAGED_EFFECT = 1 << 24;
/**
 * An effect that does not destroy its child effects when it reruns (like MANAGED_EFFECT).
 * Runs eagerly as part of tree traversal or effect flushing.
 */
const BLOCK_EFFECT = 1 << 4;
const BRANCH_EFFECT = 1 << 5;
const ROOT_EFFECT = 1 << 6;
const BOUNDARY_EFFECT = 1 << 7;
/**
 * Set on the effect that `pause_effect` was called on, i.e. the root of a paused subtree,
 * as opposed to its descendants which are merely `INERT`. This allows `resume_effect` on
 * an ancestor to skip subtrees that were paused for their own reasons (such as a block
 * whose condition is still false) rather than resurrecting them
 */
const PAUSED = 1 << 8;
/**
 * Indicates that a reaction is connected to an effect root — either it is an effect,
 * or it is a derived that is depended on by at least one effect. If a derived has
 * no dependents, we can disconnect it from the graph, allowing it to either be
 * GC'd or reconnected later if an effect comes to depend on it again
 */
const CONNECTED = 1 << 9;
const CLEAN = 1 << 10;
const DIRTY = 1 << 11;
const MAYBE_DIRTY = 1 << 12;
const INERT = 1 << 13;
const DESTROYED = 1 << 14;
/** Set once a reaction has run for the first time */
const REACTION_RAN = 1 << 15;
/** Effect is in the process of getting destroyed. Can be observed in child teardown functions */
const DESTROYING = 1 << 25;

// Flags exclusive to effects
/**
 * 'Transparent' effects do not create a transition boundary.
 * This is on a block effect 99% of the time but may also be on a branch effect if its parent block effect was pruned
 */
const EFFECT_TRANSPARENT = 1 << 16;
const EAGER_EFFECT = 1 << 17;
const HEAD_EFFECT = 1 << 18;
const EFFECT_PRESERVED = 1 << 19;
const USER_EFFECT = 1 << 20;
const EFFECT_OFFSCREEN = 1 << 25;

// Flags used for async
const REACTION_IS_UPDATING = 1 << 21;
const ASYNC = 1 << 22;

const ERROR_VALUE = 1 << 23;

const STATE_SYMBOL = Symbol('$state');
/** Marks component export objects, so that `proxy(...)` leaves them untouched */
const COMPONENT_SYMBOL = Symbol('component');
const LOADING_ATTR_SYMBOL = Symbol('');
const PROXY_PATH_SYMBOL = Symbol('proxy path');
const ATTRIBUTES_CACHE = Symbol('attributes');
const CLASS_CACHE = Symbol('class');
const STYLE_CACHE = Symbol('style');
const TEXT_CACHE = Symbol('text');
const FORM_RESET_HANDLER = Symbol('form reset');
/** An anchor might change, via this symbol on the original anchor we can tell HMR about the updated anchor */
const HMR_ANCHOR = Symbol('hmr anchor');

/** allow users to ignore aborted signal errors if `reason.name === 'StaleReactionError` */
const STALE_REACTION = new (class StaleReactionError extends Error {
	name = 'StaleReactionError';
	message = 'The reaction that called `getAbortSignal()` was re-run or destroyed';
})();

const IS_XHTML =
	// We gotta write it like this because after downleveling the pure comment may end up in the wrong location
	!!globalThis.document?.contentType &&
	/* @__PURE__ */ globalThis.document.contentType.includes('xml');

const EACH_ITEM_REACTIVE = 1;
const EACH_INDEX_REACTIVE = 1 << 1;
/** See EachBlock interface metadata.is_controlled for an explanation what this is */
const EACH_IS_CONTROLLED = 1 << 2;
const EACH_IS_ANIMATED = 1 << 3;
const EACH_ITEM_IMMUTABLE = 1 << 4;

const TEMPLATE_FRAGMENT = 1;
const TEMPLATE_USE_IMPORT_NODE = 1 << 1;
const HYDRATION_ERROR = {};

const UNINITIALIZED = Symbol('uninitialized');

// Dev-time component properties
const FILENAME = Symbol('filename');

const NAMESPACE_HTML = 'http://www.w3.org/1999/xhtml';
const NAMESPACE_SVG = 'http://www.w3.org/2000/svg';
const NAMESPACE_MATHML = 'http://www.w3.org/1998/Math/MathML';

/* This file is generated by scripts/process-messages/index.js. Do not edit! */


var bold = 'font-weight: bold';
var normal = 'font-weight: normal';

/**
 * Detected reactivity loss when reading `%name%`. This happens when state is read in an async function after an earlier `await`
 * @param {string} name
 */
function await_reactivity_loss(name) {
	if (DEV) {
		console.warn(`%c[svelte] await_reactivity_loss\n%cDetected reactivity loss when reading \`${name}\`. This happens when state is read in an async function after an earlier \`await\`\nhttps://svelte.dev/e/await_reactivity_loss`, bold, normal);
	} else {
		console.warn(`https://svelte.dev/e/await_reactivity_loss`);
	}
}

/**
 * Reading a derived belonging to a now-destroyed effect may result in stale values
 */
function derived_inert() {
	if (DEV) {
		console.warn(`%c[svelte] derived_inert\n%cReading a derived belonging to a now-destroyed effect may result in stale values\nhttps://svelte.dev/e/derived_inert`, bold, normal);
	} else {
		console.warn(`https://svelte.dev/e/derived_inert`);
	}
}

/**
 * Reactive `$state(...)` proxies and the values they proxy have different identities. Because of this, comparisons with `%operator%` will produce unexpected results
 * @param {string} operator
 */
function state_proxy_equality_mismatch(operator) {
	if (DEV) {
		console.warn(`%c[svelte] state_proxy_equality_mismatch\n%cReactive \`$state(...)\` proxies and the values they proxy have different identities. Because of this, comparisons with \`${operator}\` will produce unexpected results\nhttps://svelte.dev/e/state_proxy_equality_mismatch`, bold, normal);
	} else {
		console.warn(`https://svelte.dev/e/state_proxy_equality_mismatch`);
	}
}

/**
 * A `<svelte:boundary>` `reset` function only resets the boundary the first time it is called
 */
function svelte_boundary_reset_noop() {
	if (DEV) {
		console.warn(`%c[svelte] svelte_boundary_reset_noop\n%cA \`<svelte:boundary>\` \`reset\` function only resets the boundary the first time it is called\nhttps://svelte.dev/e/svelte_boundary_reset_noop`, bold, normal);
	} else {
		console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`);
	}
}

/** @import { Equals } from '#client' */

/** @type {Equals} */
function equals(value) {
	return value === this.v;
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function safe_not_equal(a, b) {
	return a != a
		? b == b
		: a !== b || (a !== null && typeof a === 'object') || typeof a === 'function';
}

/** @type {Equals} */
function safe_equals(value) {
	return !safe_not_equal(value, this.v);
}

/* This file is generated by scripts/process-messages/index.js. Do not edit! */


/**
 * An invariant violation occurred, meaning Svelte's internal assumptions were flawed. This is a bug in Svelte, not your app — please open an issue at https://github.com/sveltejs/svelte, citing the following message: "%message%"
 * @param {string} message
 * @returns {never}
 */
function invariant_violation(message) {
	if (DEV) {
		const error = new Error(`invariant_violation\nAn invariant violation occurred, meaning Svelte's internal assumptions were flawed. This is a bug in Svelte, not your app — please open an issue at https://github.com/sveltejs/svelte, citing the following message: "${message}"\nhttps://svelte.dev/e/invariant_violation`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/invariant_violation`);
	}
}

/**
 * `%name%(...)` can only be used during component initialisation
 * @param {string} name
 * @returns {never}
 */
function lifecycle_outside_component(name) {
	if (DEV) {
		const error = new Error(`lifecycle_outside_component\n\`${name}(...)\` can only be used during component initialisation\nhttps://svelte.dev/e/lifecycle_outside_component`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/lifecycle_outside_component`);
	}
}

/* This file is generated by scripts/process-messages/index.js. Do not edit! */


/**
 * Cannot create a `$derived(...)` with an `await` expression outside of an effect tree
 * @returns {never}
 */
function async_derived_orphan() {
	if (DEV) {
		const error = new Error(`async_derived_orphan\nCannot create a \`$derived(...)\` with an \`await\` expression outside of an effect tree\nhttps://svelte.dev/e/async_derived_orphan`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/async_derived_orphan`);
	}
}

/**
 * Using `bind:value` together with a checkbox input is not allowed. Use `bind:checked` instead
 * @returns {never}
 */
function bind_invalid_checkbox_value() {
	if (DEV) {
		const error = new Error(`bind_invalid_checkbox_value\nUsing \`bind:value\` together with a checkbox input is not allowed. Use \`bind:checked\` instead\nhttps://svelte.dev/e/bind_invalid_checkbox_value`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/bind_invalid_checkbox_value`);
	}
}

/**
 * A derived value cannot reference itself recursively
 * @returns {never}
 */
function derived_references_self() {
	if (DEV) {
		const error = new Error(`derived_references_self\nA derived value cannot reference itself recursively\nhttps://svelte.dev/e/derived_references_self`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/derived_references_self`);
	}
}

/**
 * Keyed each block has duplicate key `%value%` at indexes %a% and %b%
 * @param {string} a
 * @param {string} b
 * @param {string | undefined | null} [value]
 * @returns {never}
 */
function each_key_duplicate(a, b, value) {
	if (DEV) {
		const error = new Error(`each_key_duplicate\n${value
			? `Keyed each block has duplicate key \`${value}\` at indexes ${a} and ${b}`
			: `Keyed each block has duplicate key at indexes ${a} and ${b}`}\nhttps://svelte.dev/e/each_key_duplicate`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/each_key_duplicate`);
	}
}

/**
 * Keyed each block has key that is not idempotent — the key for item at index %index% was `%a%` but is now `%b%`. Keys must be the same each time for a given item
 * @param {string} index
 * @param {string} a
 * @param {string} b
 * @returns {never}
 */
function each_key_volatile(index, a, b) {
	if (DEV) {
		const error = new Error(`each_key_volatile\nKeyed each block has key that is not idempotent — the key for item at index ${index} was \`${a}\` but is now \`${b}\`. Keys must be the same each time for a given item\nhttps://svelte.dev/e/each_key_volatile`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/each_key_volatile`);
	}
}

/**
 * `%rune%` cannot be used inside an effect cleanup function
 * @param {string} rune
 * @returns {never}
 */
function effect_in_teardown(rune) {
	if (DEV) {
		const error = new Error(`effect_in_teardown\n\`${rune}\` cannot be used inside an effect cleanup function\nhttps://svelte.dev/e/effect_in_teardown`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/effect_in_teardown`);
	}
}

/**
 * Effect cannot be created inside a `$derived` value that was not itself created inside an effect
 * @returns {never}
 */
function effect_in_unowned_derived() {
	if (DEV) {
		const error = new Error(`effect_in_unowned_derived\nEffect cannot be created inside a \`$derived\` value that was not itself created inside an effect\nhttps://svelte.dev/e/effect_in_unowned_derived`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/effect_in_unowned_derived`);
	}
}

/**
 * `%rune%` can only be used inside an effect (e.g. during component initialisation)
 * @param {string} rune
 * @returns {never}
 */
function effect_orphan(rune) {
	if (DEV) {
		const error = new Error(`effect_orphan\n\`${rune}\` can only be used inside an effect (e.g. during component initialisation)\nhttps://svelte.dev/e/effect_orphan`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/effect_orphan`);
	}
}

/**
 * Maximum update depth exceeded. This typically indicates that an effect reads and writes the same piece of state
 * @returns {never}
 */
function effect_update_depth_exceeded() {
	if (DEV) {
		const error = new Error(`effect_update_depth_exceeded\nMaximum update depth exceeded. This typically indicates that an effect reads and writes the same piece of state\nhttps://svelte.dev/e/effect_update_depth_exceeded`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/effect_update_depth_exceeded`);
	}
}

/**
 * The `%rune%` rune is only available inside `.svelte` and `.svelte.js/ts` files
 * @param {string} rune
 * @returns {never}
 */
function rune_outside_svelte(rune) {
	if (DEV) {
		const error = new Error(`rune_outside_svelte\nThe \`${rune}\` rune is only available inside \`.svelte\` and \`.svelte.js/ts\` files\nhttps://svelte.dev/e/rune_outside_svelte`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/rune_outside_svelte`);
	}
}

/**
 * Property descriptors defined on `$state` objects must contain `value` and always be `enumerable`, `configurable` and `writable`.
 * @returns {never}
 */
function state_descriptors_fixed() {
	if (DEV) {
		const error = new Error(`state_descriptors_fixed\nProperty descriptors defined on \`$state\` objects must contain \`value\` and always be \`enumerable\`, \`configurable\` and \`writable\`.\nhttps://svelte.dev/e/state_descriptors_fixed`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/state_descriptors_fixed`);
	}
}

/**
 * Cannot set prototype of `$state` object
 * @returns {never}
 */
function state_prototype_fixed() {
	if (DEV) {
		const error = new Error(`state_prototype_fixed\nCannot set prototype of \`$state\` object\nhttps://svelte.dev/e/state_prototype_fixed`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/state_prototype_fixed`);
	}
}

/**
 * Updating state inside `$derived(...)`, `$inspect(...)` or a template expression is forbidden. If the value should not be reactive, declare it without `$state`
 * @returns {never}
 */
function state_unsafe_mutation() {
	if (DEV) {
		const error = new Error(`state_unsafe_mutation\nUpdating state inside \`$derived(...)\`, \`$inspect(...)\` or a template expression is forbidden. If the value should not be reactive, declare it without \`$state\`\nhttps://svelte.dev/e/state_unsafe_mutation`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/state_unsafe_mutation`);
	}
}

/**
 * A `<svelte:boundary>` `reset` function cannot be called while an error is still being handled
 * @returns {never}
 */
function svelte_boundary_reset_onerror() {
	if (DEV) {
		const error = new Error(`svelte_boundary_reset_onerror\nA \`<svelte:boundary>\` \`reset\` function cannot be called while an error is still being handled\nhttps://svelte.dev/e/svelte_boundary_reset_onerror`);

		error.name = 'Svelte error';

		throw error;
	} else {
		throw new Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`);
	}
}

/** True if experimental.async=true */
/** True if we're not certain that we only have Svelte 5 code in the compilation */
let legacy_mode_flag = false;
/** True if $inspect.trace is used */
let tracing_mode_flag = false;

function enable_legacy_mode_flag() {
	legacy_mode_flag = true;
}

/** @import { Derived, Reaction, Value } from '#client' */

/**
 * @template {Value} T
 * @param {T} source
 * @param {string} label
 * @returns {T}
 */
function tag(source, label) {
	source.label = label;
	tag_proxy(source.v, label);

	return source;
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function tag_proxy(value, label) {
	// @ts-expect-error
	value?.[PROXY_PATH_SYMBOL]?.(label);
	return value;
}

/**
 * @param {string} label
 * @returns {Error & { stack: string } | null}
 */
function get_error(label) {
	const error = new Error();
	const stack = get_stack();

	if (stack.length === 0) {
		return null;
	}

	stack.unshift('\n');

	define_property(error, 'stack', {
		value: stack.join('\n')
	});

	define_property(error, 'name', {
		value: label
	});

	return /** @type {Error & { stack: string }} */ (error);
}

/**
 * @returns {string[]}
 */
function get_stack() {
	// @ts-ignore - doesn't exist everywhere
	const limit = Error.stackTraceLimit;
	// @ts-ignore - doesn't exist everywhere
	Error.stackTraceLimit = Infinity;
	const stack = new Error().stack;
	// @ts-ignore - doesn't exist everywhere
	Error.stackTraceLimit = limit;

	if (!stack) return [];

	const lines = stack.split('\n');
	const new_lines = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const posixified = line.replaceAll('\\', '/');

		if (line.trim() === 'Error') {
			continue;
		}

		if (line.includes('validate_each_keys')) {
			return [];
		}

		if (posixified.includes('svelte/src/internal') || posixified.includes('node_modules/.vite')) {
			continue;
		}

		new_lines.push(line);
	}

	return new_lines;
}

/**
 * @param {boolean} condition
 * @param {string} message
 */
function invariant(condition, message) {
	if (!DEV) {
		throw new Error('invariant(...) was not guarded by if (DEV)');
	}

	if (!condition) invariant_violation(message);
}

/** @import { ComponentContext, DevStackEntry, Effect } from '#client' */

/** @type {ComponentContext | null} */
let component_context = null;

/** @param {ComponentContext | null} context */
function set_component_context(context) {
	component_context = context;
}

/** @type {DevStackEntry | null} */
let dev_stack = null;

/** @param {DevStackEntry | null} stack */
function set_dev_stack(stack) {
	dev_stack = stack;
}

/**
 * The current component function. Different from current component context:
 * ```html
 * <!-- App.svelte -->
 * <Foo>
 *   <Bar /> <!-- context == Foo.svelte, function == App.svelte -->
 * </Foo>
 * ```
 * @type {ComponentContext['function']}
 */
let dev_current_component_function = null;

/** @param {ComponentContext['function']} fn */
function set_dev_current_component_function(fn) {
	dev_current_component_function = fn;
}

/**
 * @param {Record<string, unknown>} props
 * @param {any} runes
 * @param {Function} [fn]
 * @returns {void}
 */
function push(props, runes = false, fn) {
	component_context = {
		p: component_context,
		i: false,
		c: null,
		e: null,
		s: props,
		x: null,
		r: /** @type {Effect} */ (active_effect),
		l: legacy_mode_flag && !runes ? { s: null, u: null, $: [] } : null
	};

	if (DEV) {
		// component function
		component_context.function = fn;
		dev_current_component_function = fn;
	}
}

/**
 * @template {Record<string, any>} T
 * @param {T} [component]
 * @returns {T}
 */
function pop(component) {
	var context = /** @type {ComponentContext} */ (component_context);
	var effects = context.e;

	if (effects !== null) {
		context.e = null;

		for (var fn of effects) {
			create_user_effect(fn);
		}
	}

	if (component !== undefined) {
		context.x = component;
	}

	context.i = true;

	component_context = context.p;

	if (DEV) {
		dev_current_component_function = component_context?.function ?? null;
	}

	return mark_as_component(component);
}

/**
 * Add a symbol to the object (or create one if undefined) to mark it as a component so it isn't proxified.
 * @param {any} component
 */
function mark_as_component(component = {}) {
	define_property(component, COMPONENT_SYMBOL, { value: true });
	return component;
}

/** @returns {boolean} */
function is_runes() {
	return !legacy_mode_flag || (component_context !== null && component_context.l === null);
}

/** @type {Array<() => void>} */
let micro_tasks = [];

function run_micro_tasks() {
	var tasks = micro_tasks;
	micro_tasks = [];
	run_all(tasks);
}

/**
 * @param {() => void} fn
 */
function queue_micro_task(fn) {
	if (micro_tasks.length === 0 && !is_flushing_sync) {
		var tasks = micro_tasks;
		queueMicrotask(() => {
			// If this is false, a flushSync happened in the meantime. Do _not_ run new scheduled microtasks in that case
			// as the ordering of microtasks would be broken at that point - consider this case:
			// - queue_micro_task schedules microtask A to flush task X
			// - synchronously after, flushSync runs, processing task X
			// - synchronously after, some other microtask B is scheduled, but not through queue_micro_task but for example a Promise.resolve() in user code
			// - synchronously after, queue_micro_task schedules microtask C to flush task Y
			// - one tick later, microtask A now resolves, flushing task Y before microtask B, which is incorrect
			// This if check prevents that race condition (that realistically will only happen in tests)
			if (tasks === micro_tasks) run_micro_tasks();
		});
	}

	micro_tasks.push(fn);
}

/**
 * Synchronously run any queued tasks.
 */
function flush_tasks() {
	while (micro_tasks.length > 0) {
		run_micro_tasks();
	}
}

/** @import { Derived, Signal } from '#client' */

const STATUS_MASK = -7169;

/**
 * @param {Signal} signal
 * @param {number} status
 */
function set_signal_status(signal, status) {
	signal.f = (signal.f & STATUS_MASK) | status;
}

/**
 * Set a derived's status to CLEAN or MAYBE_DIRTY based on its connection state.
 * @param {Derived} derived
 */
function update_derived_status(derived) {
	// Only mark as MAYBE_DIRTY if disconnected and has dependencies.
	if ((derived.f & CONNECTED) !== 0 || derived.deps === null) {
		set_signal_status(derived, CLEAN);
	} else {
		set_signal_status(derived, MAYBE_DIRTY);
	}
}

/** @import { Effect } from '#client' */

/**
 * @param {Effect} effect
 * @param {Set<Effect>} dirty_effects
 * @param {Set<Effect>} maybe_dirty_effects
 */
function defer_effect(effect, dirty_effects, maybe_dirty_effects) {
	if ((effect.f & DIRTY) !== 0) {
		dirty_effects.add(effect);
	} else if ((effect.f & MAYBE_DIRTY) !== 0) {
		maybe_dirty_effects.add(effect);
	}

	// mark as clean so they get scheduled if they depend on pending async state
	set_signal_status(effect, CLEAN);
}

let listening_to_form_reset = false;

function add_form_reset_listener() {
	if (!listening_to_form_reset) {
		listening_to_form_reset = true;
		document.addEventListener(
			'reset',
			(evt) => {
				// Needs to happen one tick later or else the dom properties of the form
				// elements have not updated to their reset values yet
				Promise.resolve().then(() => {
					if (!evt.defaultPrevented) {
						for (const e of /**@type {HTMLFormElement} */ (evt.target).elements) {
							/** @type {any} */ (e)[FORM_RESET_HANDLER]?.();
						}
					}
				});
			},
			// In the capture phase to guarantee we get noticed of it (no possibility of stopPropagation)
			{ capture: true }
		);
	}
}

/**
 * @template T
 * @param {() => T} fn
 */
function without_reactive_context(fn) {
	var previous_reaction = active_reaction;
	var previous_effect = active_effect;
	set_active_reaction(null);
	set_active_effect(null);
	try {
		return fn();
	} finally {
		set_active_reaction(previous_reaction);
		set_active_effect(previous_effect);
	}
}

/**
 * Listen to the given event, and then instantiate a global form reset listener if not already done,
 * to notify all bindings when the form is reset
 * @param {HTMLElement} element
 * @param {string} event
 * @param {(is_reset?: true) => void} handler
 * @param {(is_reset?: true) => void} [on_reset]
 */
function listen_to_event_and_reset_event(element, event, handler, on_reset = handler) {
	element.addEventListener(event, () => without_reactive_context(handler));
	const prev = /** @type {any} */ (element)[FORM_RESET_HANDLER];
	if (prev) {
		// special case for checkbox that can have multiple binds (group & checked)
		/** @type {any} */ (element)[FORM_RESET_HANDLER] = () => {
			prev();
			on_reset(true);
		};
	} else {
		/** @type {any} */ (element)[FORM_RESET_HANDLER] = () => on_reset(true);
	}

	add_form_reset_listener();
}

/** @import { Blocker, Effect, Source, Value } from '#client' */

/**
 * @param {Blocker[]} blockers
 * @param {Array<() => any>} sync
 * @param {Array<() => Promise<any>>} async
 * @param {(values: Value[]) => any} fn
 */
function flatten(blockers, sync, async, fn) {
	const d = is_runes() ? derived : derived_safe_equal;

	// Filter out already-settled blockers - no need to wait for them
	var pending = blockers.filter((b) => !b.settled);

	var deriveds = sync.map(d);

	if (DEV) {
		deriveds.forEach((d, i) => {
			// TODO this is kinda useful for debugging but a lousy implementation —
			// maybe the compiler could pass through the template string
			d.label = sync[i]
				.toString()
				.replace('() => ', '')
				.replaceAll('$.eager(() => ', '$state.eager(')
				.replace(/\$\.get\((.+?)\)/g, (_, id) => id);
		});
	}

	if (async.length === 0 && pending.length === 0) {
		fn(deriveds);
		return;
	}

	var parent = /** @type {Effect} */ (active_effect);

	var restore = capture();
	var blocker_promise =
		pending.length === 1
			? pending[0].promise
			: pending.length > 1
				? Promise.all(pending.map((b) => b.promise))
				: null;

	/**
	 * @param {Source[]} async
	 */
	function finish(async) {
		if ((parent.f & DESTROYED) !== 0) {
			return;
		}

		restore();

		try {
			fn([...deriveds, ...async]);
		} catch (error) {
			invoke_error_boundary(error, parent);
		}

		unset_context();
	}

	var decrement_pending = increment_pending();

	// Fast path: blockers but no async expressions
	if (async.length === 0) {
		/** @type {Promise<any>} */ (blocker_promise).then(() => finish([])).finally(decrement_pending);
		return;
	}

	// Full path: has async expressions
	function run() {
		Promise.all(async.map((expression) => async_derived(expression)))
			.then(finish)
			.catch((error) => invoke_error_boundary(error, parent))
			.finally(decrement_pending);
	}

	if (blocker_promise) {
		blocker_promise.then(() => {
			if ((parent.f & DESTROYED) !== 0) {
				decrement_pending();
				return;
			}

			restore();
			run();
			unset_context();
		});
	} else {
		run();
	}
}

/**
 * Captures the current effect context so that we can restore it after
 * some asynchronous work has happened (so that e.g. `await a + b`
 * causes `b` to be registered as a dependency).
 */
function capture() {
	var previous_effect = /** @type {Effect} */ (active_effect);
	var previous_reaction = active_reaction;
	var previous_component_context = component_context;
	var previous_batch = /** @type {Batch} */ (current_batch);

	if (DEV) {
		var previous_dev_stack = dev_stack;
	}

	return function restore(activate_batch = true) {
		set_active_effect(previous_effect);
		set_active_reaction(previous_reaction);
		set_component_context(previous_component_context);

		if (activate_batch && (previous_effect.f & DESTROYED) === 0) {
			// TODO we only need optional chaining here because `{#await ...}` blocks
			// are anomalous. Once we retire them we can get rid of it
			previous_batch?.activate();
			previous_batch?.apply();
		}

		if (DEV) {
			set_reactivity_loss_tracker(null);
			set_dev_stack(previous_dev_stack);
		}
	};
}

function unset_context(deactivate_batch = true) {
	set_active_effect(null);
	set_active_reaction(null);
	set_component_context(null);
	if (deactivate_batch) current_batch?.deactivate();

	if (DEV) {
		set_reactivity_loss_tracker(null);
		set_dev_stack(null);
	}
}

/**
 * @returns {(skip?: boolean) => void}
 */
function increment_pending() {
	var effect = /** @type {Effect} */ (active_effect);
	var boundary = effect.b; // undefined if called outside the render tree, e.g. a standalone $effect.root
	var batch = /** @type {Batch} */ (current_batch);
	var blocking = !!boundary?.is_rendered();

	boundary?.update_pending_count(1, batch);
	batch.increment(blocking, effect);

	return () => {
		boundary?.update_pending_count(-1, batch);
		batch.decrement(blocking, effect);
	};
}

/** @import { Derived, Effect, Reaction, Source, Value } from '#client' */
/** @import { Batch } from './batch.js'; */
/** @import { Boundary } from '../dom/blocks/boundary.js'; */

/**
 * This allows us to track 'reactivity loss' that occurs when signals
 * are read after a non-context-restoring `await`. Dev-only
 * @type {{ effect: Effect, effect_deps: Set<Value>, warned: boolean } | null}
 */
let reactivity_loss_tracker = null;

/** @param {{ effect: Effect, effect_deps: Set<Value>, warned: boolean } | null} v */
function set_reactivity_loss_tracker(v) {
	reactivity_loss_tracker = v;
}

const recent_async_deriveds = new Set();

/**
 * @template V
 * @param {() => V} fn
 * @returns {Derived<V>}
 */
/*#__NO_SIDE_EFFECTS__*/
function derived(fn) {
	var flags = DERIVED | DIRTY;

	if (active_effect !== null) {
		// Since deriveds are evaluated lazily, any effects created inside them are
		// created too late to ensure that the parent effect is added to the tree
		active_effect.f |= EFFECT_PRESERVED;
	}

	/** @type {Derived<V>} */
	const signal = {
		ctx: component_context,
		deps: null,
		effects: null,
		equals,
		f: flags,
		fn,
		reactions: null,
		rv: 0,
		v: /** @type {V} */ (UNINITIALIZED),
		wv: 0,
		parent: active_effect,
		ac: null
	};

	return signal;
}

const OBSOLETE = Symbol('obsolete');

/**
 * @template V
 * @param {() => V | Promise<V>} fn
 * @param {string} [label]
 * @param {string} [location] If provided, print a warning if the value is not read immediately after update
 * @returns {Promise<Source<V>>}
 */
/*#__NO_SIDE_EFFECTS__*/
function async_derived(fn, label, location) {
	let parent = /** @type {Effect | null} */ (active_effect);

	if (parent === null) {
		async_derived_orphan();
	}

	var promise = /** @type {Promise<V>} */ (/** @type {unknown} */ (undefined));
	var signal = source(/** @type {V} */ (UNINITIALIZED));

	if (DEV) signal.label = fn.toString();

	// only suspend in async deriveds created on initialisation
	var should_suspend = !active_reaction;

	/** @type {Set<ReturnType<typeof deferred<V>>>} */
	var deferreds = new Set();

	async_effect(() => {
		var effect = /** @type {Effect} */ (active_effect);

		if (DEV) {
			reactivity_loss_tracker = { effect, effect_deps: new Set(), warned: false };
		}

		/** @type {ReturnType<typeof deferred<V>>} */
		var d = deferred();
		promise = d.promise;

		try {
			// If this code is changed at some point, make sure to still access the then property
			// of fn() to read any signals it might access, so that we track them as dependencies.
			// We call `unset_context` to undo any `save` calls that happen inside `fn()`
			Promise.resolve(fn())
				.then(d.resolve, (e) => {
					// if the promise was rejected by the user, via `getAbortSignal`, then
					// wait for a subsequent resolution instead of flushing the batch
					if (e !== STALE_REACTION) d.reject(e);
				})
				.finally(unset_context);
		} catch (error) {
			d.reject(error);
			unset_context();
		}

		if (DEV) {
			if (reactivity_loss_tracker) {
				// Reused deps from previous run (indices 0 to skipped_deps-1)
				// We deliberately only track direct dependencies of the async expression to encourage
				// dependencies being directly visible at the point of the expression
				if (effect.deps !== null) {
					for (let i = 0; i < skipped_deps; i += 1) {
						reactivity_loss_tracker.effect_deps.add(effect.deps[i]);
					}
				}

				// New deps discovered this run
				if (new_deps !== null) {
					for (let i = 0; i < new_deps.length; i += 1) {
						reactivity_loss_tracker.effect_deps.add(new_deps[i]);
					}
				}
			}

			reactivity_loss_tracker = null;
		}

		var batch = /** @type {Batch} */ (current_batch);

		if (should_suspend) {
			// we only increment the batch's pending state for updates, not creation, otherwise
			// we will decrement to zero before the work that depends on this promise (e.g. a
			// template effect) has initialized, causing the batch to resolve prematurely
			if ((effect.f & REACTION_RAN) !== 0) {
				var decrement_pending = increment_pending();
			}

			if (
				// boundary can be null if the async derived is inside an $effect.root not connected to the component render tree
				parent.b?.is_rendered()
			) {
				batch.async_deriveds.get(effect)?.reject(OBSOLETE);
			} else {
				// While the boundary is still showing pending, a new run supersedes all older in-flight runs
				// for this async expression. Cancel eagerly so resolution cannot commit stale values.
				for (const d of deferreds.values()) {
					d.reject(OBSOLETE);
				}
			}

			deferreds.add(d);
			batch.async_deriveds.set(effect, d);
		}

		/**
		 * @param {any} value
		 * @param {unknown} error
		 */
		const handler = (value, error = undefined) => {
			if (DEV) {
				reactivity_loss_tracker = null;
			}

			decrement_pending?.();
			deferreds.delete(d);

			if (error === OBSOLETE) return;

			batch.activate();

			if (error) {
				signal.f |= ERROR_VALUE;

				// @ts-expect-error the error is the wrong type, but we don't care
				internal_set(signal, error);
			} else {
				if ((signal.f & ERROR_VALUE) !== 0) {
					signal.f ^= ERROR_VALUE;
				}

				internal_set(signal, value);
			}

			batch.deactivate();
		};

		d.promise.then(handler, (e) => handler(null, e || 'unknown'));
	});

	teardown(() => {
		for (const d of deferreds) {
			d.reject(OBSOLETE);
		}
	});

	if (DEV) {
		// add a flag that lets this be printed as a derived
		// when using `$inspect.trace()`
		signal.f |= ASYNC;
	}

	return new Promise((fulfil) => {
		/** @param {Promise<V>} p */
		function next(p) {
			function go() {
				if (p === promise) {
					fulfil(signal);
				} else {
					// if the effect re-runs before the initial promise
					// resolves, delay resolution until we have a value
					next(promise);
				}
			}

			p.then(go, go);
		}

		next(promise);
	});
}

/**
 * @template V
 * @param {() => V} fn
 * @returns {Derived<V>}
 */
/*#__NO_SIDE_EFFECTS__*/
function user_derived(fn) {
	const d = derived(fn);

	push_reaction_value(d);

	return d;
}

/**
 * @template V
 * @param {() => V} fn
 * @returns {Derived<V>}
 */
/*#__NO_SIDE_EFFECTS__*/
function derived_safe_equal(fn) {
	const signal = derived(fn);
	signal.equals = safe_equals;
	return signal;
}

/**
 * @param {Derived} derived
 * @returns {void}
 */
function destroy_derived_effects(derived) {
	var effects = derived.effects;

	if (effects !== null) {
		derived.effects = null;

		for (var i = 0; i < effects.length; i += 1) {
			destroy_effect(/** @type {Effect} */ (effects[i]));
		}
	}
}

/**
 * The currently updating deriveds, used to detect infinite recursion
 * in dev mode and provide a nicer error than 'too much recursion'
 * @type {Derived[]}
 */
let stack = [];

/**
 * @template T
 * @param {Derived} derived
 * @returns {T}
 */
function execute_derived(derived) {
	var value;
	var prev_active_effect = active_effect;
	var parent = derived.parent;

	if (
		!is_destroying_effect &&
		parent !== null &&
		derived.v !== UNINITIALIZED && // if it was never evaluated before, it's guaranteed to fail downstream, so we try to execute instead
		(parent.f & (DESTROYED | INERT)) !== 0
	) {
		derived_inert();

		return derived.v;
	}

	set_active_effect(parent);

	if (DEV) {
		let prev_eager_effects = eager_effects;
		set_eager_effects(new Set());
		try {
			if (includes.call(stack, derived)) {
				derived_references_self();
			}

			stack.push(derived);

			destroy_derived_effects(derived);
			value = update_reaction(derived);
		} finally {
			set_active_effect(prev_active_effect);
			set_eager_effects(prev_eager_effects);
			stack.pop();
		}
	} else {
		try {
			destroy_derived_effects(derived);
			value = update_reaction(derived);
		} finally {
			set_active_effect(prev_active_effect);
		}
	}

	return value;
}

/**
 * @param {Derived} derived
 * @returns {void}
 */
function update_derived(derived) {
	var value = execute_derived(derived);

	if (!derived.equals(value)) {
		derived.wv = increment_write_version();

		// in a fork, we don't update the underlying value, just `batch_values`.
		// the underlying value will be updated when the fork is committed.
		// otherwise, the next time we get here after a 'real world' state
		// change, `derived.equals` may incorrectly return `true`
		if (!current_batch?.is_fork || derived.deps === null) {
			if (current_batch !== null) {
				// We also write to previous_batch because if it exists, it is a sign that we're
				// currently in the process of flushing effects. These updates to deriveds may belong
				// to the previous batch, not the new one (which can already exist if an earlier
				// effect wrote to a source). This can cause bugs when running batch.#commit() later,
				// but not adding it to current_batch can, too, so we add it to both.
				// See https://github.com/sveltejs/svelte/pull/18117 for more details.
				current_batch.capture(derived, value, true);
				previous_batch?.capture(derived, value, true);
			} else {
				derived.v = value;
			}

			// deriveds without dependencies should never be recomputed
			if (derived.deps === null) {
				set_signal_status(derived, CLEAN);
				return;
			}
		}
	}

	// don't mark derived clean if we're reading it inside a
	// cleanup function, or it will cache a stale value
	if (is_destroying_effect) {
		return;
	}

	// During time traveling we don't want to reset the status so that
	// traversal of the graph in the other batches still happens
	if (batch_values !== null) {
		// only cache the value if we're in a tracking context, otherwise we won't
		// clear the cache in `mark_reactions` when dependencies are updated
		if (effect_tracking() || current_batch?.is_fork) {
			batch_values.set(derived, value);
		}
	} else {
		update_derived_status(derived);
	}
}

/**
 * @param {Derived} derived
 */
function freeze_derived_effects(derived) {
	if (derived.effects === null) return;

	for (const e of derived.effects) {
		// if the effect has a teardown function or abort signal, call it
		if (e.teardown || e.ac) {
			e.teardown?.();
			if (e.ac !== null) {
				without_reactive_context(() => {
					/** @type {AbortController} */ (e.ac).abort(STALE_REACTION);
					e.ac = null;
				});
			}

			// make it a noop so it doesn't get called again if the derived
			// is unfrozen. we don't set it to `null`, because the existence
			// of a teardown function is what determines whether the
			// effect runs again during unfreezing (but not for teardown-only effects)
			if (e.fn !== null) e.teardown = noop;

			remove_reactions(e, 0);
			destroy_effect_children(e);
		}
	}
}

/**
 * @param {Derived} derived
 */
function unfreeze_derived_effects(derived) {
	if (derived.effects === null) return;

	for (const e of derived.effects) {
		// if the effect was previously frozen — indicated by the presence
		// of a teardown function — unfreeze it
		if (e.teardown && e.fn !== null) {
			update_effect(e);
		}
	}
}

/** @import { Fork } from 'svelte' */
/** @import { Derived, Effect, Reaction, Source, Value } from '#client' */

/** @type {Batch | null} */
let first_batch = null;

/** @type {Batch | null} */
let last_batch = null;

/** @type {Batch | null} */
let current_batch = null;

/**
 * This is needed to avoid overwriting inputs
 * @type {Batch | null}
 */
let previous_batch = null;

/**
 * When time travelling (i.e. working in one batch, while other batches
 * still have ongoing work), we ignore the real values of affected
 * signals in favour of their values within the batch
 * @type {Map<Value, any> | null}
 */
let batch_values = null;

/** @type {Effect | null} */
let last_scheduled_effect = null;

let is_flushing_sync = false;
let is_processing = false;

/**
 * During traversal, this is an array. Newly created effects are (if not immediately
 * executed) pushed to this array, rather than going through the scheduling
 * rigamarole that would cause another turn of the flush loop.
 * @type {Effect[] | null}
 */
let collected_effects = null;

/**
 * An array of effects that are marked during traversal as a result of a `set`
 * (not `internal_set`) call. These will be added to the next batch and
 * trigger another `batch.process()`
 * @type {Effect[] | null}
 * @deprecated when we get rid of legacy mode and stores, we can get rid of this
 */
let legacy_updates = null;

var flush_count = 0;

/** @type {Set<Value>} */
var source_stacks = new Set();

let uid = 1;

class Batch {
	id = uid++;

	/** True as soon as `#process` was called */
	#started = false;

	linked = true;

	/** @type {Batch | null} */
	#prev = null;

	/** @type {Batch | null} */
	#next = null;

	/** @type {Map<Effect, ReturnType<typeof deferred<any>>>} */
	async_deriveds = new Map();

	/**
	 * The current values of any signals that are updated in this batch.
	 * Tuple format: [value, is_derived] (note: is_derived is false for deriveds, too, if they were overridden via assignment)
	 * They keys of this map are identical to `this.#previous`
	 * @type {Map<Value, [any, boolean]>}
	 */
	current = new Map();

	/**
	 * The values of any signals (sources and deriveds) that are updated in this batch _before_ those updates took place.
	 * They keys of this map are identical to `this.#current`
	 * @type {Map<Value, any>}
	 */
	previous = new Map();

	/**
	 * When the batch is committed (and the DOM is updated), we need to remove old branches
	 * and append new ones by calling the functions added inside (if/each/key/etc) blocks
	 * @type {Set<(batch: Batch) => void>}
	 */
	#commit_callbacks = new Set();

	/**
	 * If a fork is discarded, we need to destroy any effects that are no longer needed
	 * @type {Set<(batch: Batch) => void>}
	 */
	#discard_callbacks = new Set();

	/**
	 * The number of async effects that are currently in flight
	 */
	#pending = 0;

	/**
	 * Async effects that are currently in flight, _not_ inside a pending boundary
	 * @type {Map<Effect, number>}
	 */
	#blocking_pending = new Map();

	/**
	 * A deferred that resolves when the batch is committed, used with `settled()`
	 * TODO replace with Promise.withResolvers once supported widely enough
	 * @type {{ promise: Promise<void>, resolve: (value?: any) => void, reject: (reason: unknown) => void } | null}
	 */
	#deferred = null;

	/**
	 * Effects that were scheduled in this batch but not yet 'resolved' into the
	 * root effects that need to be flushed. Resolving — the upwards traversal that
	 * marks the path to each effect on the shared effect tree (see #resolve) — is
	 * deferred until the batch is processed, so that the markers are created and
	 * consumed within a single traversal. Scheduling into other batches (which can
	 * happen concurrently, e.g. while a batch is committed) can therefore never
	 * observe (and be confused by) this batch's markers.
	 * May contain duplicates — deduplication happens during resolving
	 * @type {Effect[]}
	 */
	#scheduled = [];

	/**
	 * Effects created while this batch was active.
	 * @type {Effect[]}
	 */
	#new_effects = [];

	/**
	 * Deferred effects (which run after async work has completed) that are DIRTY
	 * @type {Set<Effect>}
	 */
	#dirty_effects = new Set();

	/**
	 * Deferred effects that are MAYBE_DIRTY
	 * @type {Set<Effect>}
	 */
	#maybe_dirty_effects = new Set();

	/**
	 * A map of branches that still exist, but will be destroyed when this batch
	 * is committed — we skip over these during `process`.
	 * The value contains child effects that were dirty/maybe_dirty before being reset,
	 * so they can be rescheduled if the branch survives.
	 * @type {Map<Effect, { d: Effect[], m: Effect[] }>}
	 */
	#skipped_branches = new Map();

	/**
	 * Inverse of #skipped_branches which we need to tell prior batches to unskip them when committing
	 * @type {Set<Effect>}
	 */
	#unskipped_branches = new Set();

	is_fork = false;

	#decrement_queued = false;

	constructor() {
		// link batch
		if (last_batch === null) {
			first_batch = last_batch = this;
		} else {
			last_batch.#next = this;
			this.#prev = last_batch;
		}

		last_batch = this;
	}

	#is_deferred() {
		if (this.is_fork) return true;

		for (const effect of this.#blocking_pending.keys()) {
			var e = effect;
			var skipped = false;

			while (e.parent !== null) {
				if (this.#skipped_branches.has(e)) {
					skipped = true;
					break;
				}

				e = e.parent;
			}

			if (!skipped) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Add an effect to the #skipped_branches map and reset its children
	 * @param {Effect} effect
	 */
	skip_effect(effect) {
		if (!this.#skipped_branches.has(effect)) {
			this.#skipped_branches.set(effect, { d: [], m: [] });
		}
		this.#unskipped_branches.delete(effect);
	}

	/**
	 * Remove an effect from the #skipped_branches map and reschedule
	 * any tracked dirty/maybe_dirty child effects
	 * @param {Effect} effect
	 * @param {(e: Effect) => void} callback
	 */
	unskip_effect(effect, callback = (e) => this.schedule(e)) {
		var tracked = this.#skipped_branches.get(effect);
		if (tracked) {
			this.#skipped_branches.delete(effect);

			for (var e of tracked.d) {
				set_signal_status(e, DIRTY);
				callback(e);
			}

			for (e of tracked.m) {
				set_signal_status(e, MAYBE_DIRTY);
				callback(e);
			}
		}
		this.#unskipped_branches.add(effect);
	}

	/**
	 * Convert the effects that were scheduled in this batch into the root effects
	 * that need to be traversed, marking the path to each effect (by clearing the
	 * `CLEAN` flag on ancestor branches) so that the traversal can find them.
	 * This happens right before traversal rather than at scheduling time, so that
	 * the markers left on the (shared) effect tree are created and consumed within
	 * a single traversal — scheduling into other batches can never observe them
	 * @returns {Effect[]}
	 */
	#resolve() {
		/** @type {Effect[]} */
		var roots = [];

		for (const effect of this.#scheduled) {
			// skip effects that are destroyed, or that already ran (e.g. because
			// they were reached by the traversal that preceded a drain iteration,
			// or because they were scheduled twice)
			if ((effect.f & DESTROYED) !== 0 || (effect.f & (DIRTY | MAYBE_DIRTY)) === 0) continue;

			var e = effect;
			var covered = false;

			while (e.parent !== null) {
				e = e.parent;
				var flags = e.f;

				if ((flags & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
					if ((flags & CLEAN) === 0) {
						// the path to the root was already marked, meaning the
						// root was already collected — nothing left to do
						covered = true;
						break;
					}

					e.f ^= CLEAN;
				}
			}

			if (!covered) {
				roots.push(e);
			}
		}

		this.#scheduled = [];

		return roots;
	}

	#process() {
		this.#started = true;

		if (DEV) {
			// track all the values that were updated during this flush,
			// so that they can be reset afterwards
			for (const value of this.current.keys()) {
				source_stacks.add(value);
			}
		}

		// We always reschedule previously-deferred effects, not just when
		// #is_deferred() is true, because traversing the tree could make
		// an if block that contains the last blocking pending effect falsy,
		// causing the block to no longer be deferred.
		for (const e of this.#dirty_effects) {
			this.#maybe_dirty_effects.delete(e);
			set_signal_status(e, DIRTY);
			this.schedule(e);
		}

		for (const e of this.#maybe_dirty_effects) {
			set_signal_status(e, MAYBE_DIRTY);
			this.schedule(e);
		}

		this.apply();

		/** @type {Effect[]} */
		var effects = (collected_effects = []);

		/** @type {Effect[]} */
		var render_effects = [];

		/**
		 * @type {Effect[]}
		 * @deprecated when we get rid of legacy mode and stores, we can get rid of this
		 */
		var updates = (legacy_updates = []);

		// Effects can be scheduled during traversal (e.g. because a parent each/await/etc
		// block updated an internal source, or because an effect invalidated itself)
		// hence we loop until there are no more scheduled effects.
		while (this.#scheduled.length > 0) {
			if (flush_count++ > 1000) {
				this.#unlink();
				infinite_loop_guard(); // TODO try to reset_all() here?
			}

			for (const root of this.#resolve()) {
				try {
					this.#traverse(root, effects, render_effects);
				} catch (e) {
					reset_all(root);
					// If there's no async work left, this branch is now dead and needs
					// to be discarded to not become a zombie that is never cleaned up.
					// See https://github.com/sveltejs/svelte/issues/18221#issuecomment-4497918414
					// for a (non-minimal) reproduction that demonstrates a case where this is necessary
					// to not get follow-up false-positives via "batch has scheduled roots" invariant errors.
					if (!this.#is_deferred()) this.discard();
					throw e;
				}
			}
		}

		// any writes should take effect in a subsequent batch
		current_batch = null;

		if (updates.length > 0) {
			var batch = Batch.ensure();
			for (const e of updates) {
				batch.schedule(e);
			}
		}

		collected_effects = null;
		legacy_updates = null;

		// if the batch has outstanding pending work, stash effects and bail
		if (this.#is_deferred()) {
			this.#defer_effects(render_effects);
			this.#defer_effects(effects);

			for (const [e, t] of this.#skipped_branches) {
				reset_branch(e, t);
			}

			if (updates.length > 0) {
				/** @type {Batch} */ (/** @type {unknown} */ (current_batch)).#process();
			}

			return;
		}

		const earlier_batch = this.#find_earlier_batch();

		if (earlier_batch) {
			// If this batch collected deferred effects during traversal, they still need
			// to run after being merged into the earlier batch.
			this.#defer_effects(render_effects);
			this.#defer_effects(effects);
			earlier_batch.#merge(this);
			return;
		}

		// clear effects. Those that are still needed will be rescheduled through unskipping the skipped branches.
		this.#dirty_effects.clear();
		this.#maybe_dirty_effects.clear();

		// append/remove branches
		for (const fn of this.#commit_callbacks) fn(this);
		this.#commit_callbacks.clear();

		previous_batch = this;
		flush_queued_effects(render_effects);
		flush_queued_effects(effects);
		previous_batch = null;

		this.#deferred?.resolve();

		var next_batch = /** @type {Batch | null} */ (/** @type {unknown} */ (current_batch));

		if (this.#pending === 0 && (this.#scheduled.length === 0 || next_batch !== null)) {
			this.#unlink();
		}

		// Edge case: During traversal new branches might create effects that run immediately and set state,
		// causing an effect to be scheduled again. We need to traverse the current batch
		// once more in that case - most of the time this will just clean up dirty branches.
		if (this.#scheduled.length > 0) {
			if (next_batch !== null) {
				for (const e of this.#scheduled) {
					next_batch.#scheduled.push(e);
				}

				this.#scheduled = [];
			} else {
				next_batch = this;
			}
		}

		if (next_batch !== null) {
			old_values.clear();
			next_batch.#process();
		}
	}

	/**
	 * Traverse the effect tree, executing effects or stashing
	 * them for later execution as appropriate
	 * @param {Effect} root
	 * @param {Effect[]} effects
	 * @param {Effect[]} render_effects
	 */
	#traverse(root, effects, render_effects) {
		root.f ^= CLEAN;

		var effect = root.first;

		while (effect !== null) {
			var flags = effect.f;
			var is_branch = (flags & (BRANCH_EFFECT | ROOT_EFFECT)) !== 0;
			var is_skippable_branch = is_branch && (flags & CLEAN) !== 0;

			var skip = is_skippable_branch || (flags & INERT) !== 0 || this.#skipped_branches.has(effect);

			if (!skip && effect.fn !== null) {
				if (is_branch) {
					effect.f ^= CLEAN;
				} else if ((flags & EFFECT) !== 0) {
					effects.push(effect);
				} else if (is_dirty(effect)) {
					if ((flags & BLOCK_EFFECT) !== 0) this.#maybe_dirty_effects.add(effect);
					update_effect(effect);
				}

				var child = effect.first;

				if (child !== null) {
					effect = child;
					continue;
				}
			}

			while (effect !== null) {
				var next = effect.next;

				if (next !== null) {
					effect = next;
					break;
				}

				effect = effect.parent;
			}
		}
	}

	#find_earlier_batch() {
		var batch = this.#prev;

		while (batch !== null) {
			if (!batch.is_fork) {
				// if the batches are connected, break
				for (const [value, [, is_derived]] of this.current) {
					if (batch.current.has(value) && !is_derived) {
						return batch;
					}
				}
			}

			batch = batch.#prev;
		}

		return null;
	}

	/**
	 * @param {Batch} batch
	 */
	#merge(batch) {
		for (const [source, value] of batch.current) {
			if (!this.previous.has(source) && batch.previous.has(source)) {
				this.previous.set(source, batch.previous.get(source));
			}

			this.current.set(source, value);
		}

		for (const [effect, deferred] of batch.async_deriveds) {
			const d = this.async_deriveds.get(effect);
			if (d) deferred.promise.then(d.resolve).catch(d.reject);
		}

		// Clear them or else those that are still pending might get rejected on discard (after merged-into batch is done).
		// This can happen when batch Y merged into X and Y has a pending boundary and therefore still-pending async deriveds inside.
		batch.async_deriveds.clear();

		// Mark is not guaranteed not touch these, so we transfer them
		this.transfer_effects(batch.#dirty_effects, batch.#maybe_dirty_effects);

		/**
		 * mark all effects that depend on `batch.current`, except the
		 * async effects that we just resolved (TODO unless they depend
		 * on values in this batch that are NOT in the later batch?).
		 * Through this we also will populate the correct #skipped_branches,
		 * oncommit callbacks etc, so we don't need to merge them separately.
		 * @param {Value} value
		 */
		const mark = (value) => {
			var reactions = value.reactions;
			if (reactions === null) return;
			// skip if value is derived and is neither dirty nor maybe dirty. transitive
			// deriveds (a derived depending on another derived) are only MAYBE_DIRTY, so
			// we must continue traversing them to reach the effects that depend on them
			if ((value.f & DERIVED) !== 0 && (value.f & (DIRTY | MAYBE_DIRTY)) === 0) {
				return;
			}

			for (const reaction of reactions) {
				var flags = reaction.f;

				if ((flags & DERIVED) !== 0) {
					mark(/** @type {Derived} */ (reaction));
				} else {
					var effect = /** @type {Effect} */ (reaction);

					if (flags & (ASYNC | BLOCK_EFFECT) && !this.async_deriveds.has(effect)) {
						this.#maybe_dirty_effects.delete(effect);
						set_signal_status(effect, DIRTY);
						this.schedule(effect);
					}
				}
			}
		};

		for (const source of this.current.keys()) {
			mark(source);
		}

		this.oncommit(() => batch.discard());
		batch.#unlink();

		current_batch = this;
		this.#process();
	}

	/**
	 * @param {Effect[]} effects
	 */
	#defer_effects(effects) {
		for (var i = 0; i < effects.length; i += 1) {
			defer_effect(effects[i], this.#dirty_effects, this.#maybe_dirty_effects);
		}
	}

	/**
	 * Associate a change to a given source with the current
	 * batch, noting its previous and current values
	 * @param {Value} source
	 * @param {any} value
	 * @param {boolean} [is_derived]
	 */
	capture(source, value, is_derived = false) {
		if (source.v !== UNINITIALIZED && !this.previous.has(source)) {
			this.previous.set(source, source.v);
		}

		// Don't save errors in `batch_values`, or they won't be thrown in `runtime.js#get`
		if ((source.f & ERROR_VALUE) === 0) {
			this.current.set(source, [value, is_derived]);
			batch_values?.set(source, value);
		}

		if (!this.is_fork) {
			source.v = value;
		}
	}

	activate() {
		current_batch = this;
	}

	deactivate() {
		current_batch = null;
		batch_values = null;
	}

	flush() {
		try {
			if (DEV) {
				source_stacks.clear();
			}

			is_processing = true;
			current_batch = this;

			this.#process();
		} finally {
			flush_count = 0;
			last_scheduled_effect = null;
			collected_effects = null;
			legacy_updates = null;
			is_processing = false;

			current_batch = null;
			batch_values = null;

			old_values.clear();

			if (DEV) {
				for (const source of source_stacks) {
					source.updated = null;
				}
			}
		}
	}

	discard() {
		for (const fn of this.#discard_callbacks) fn(this);
		this.#discard_callbacks.clear();

		for (const deferred of this.async_deriveds.values()) {
			deferred.reject(OBSOLETE);
		}

		this.#unlink();
		this.#deferred?.resolve();
	}

	/**
	 * @param {Effect} effect
	 */
	register_created_effect(effect) {
		this.#new_effects.push(effect);
	}

	#commit() {
		// If there are other pending batches, they now need to be 'rebased' —
		// in other words, we re-run block/async effects with the newly
		// committed state, unless the batch in question has a more
		// recent value for a given source
		for (let batch = first_batch; batch !== null; batch = batch.#next) {
			var is_earlier = batch.id < this.id;

			/** @type {Source[]} */
			var sources = [];

			for (const [source, [value, is_derived]] of this.current) {
				if (batch.current.has(source)) {
					var batch_value = /** @type {[any, boolean]} */ (batch.current.get(source))[0]; // faster than destructuring

					if (is_earlier && value !== batch_value) {
						// bring the value up to date
						batch.current.set(source, [value, is_derived]);
					} else {
						// same value or later batch has more recent value,
						// no need to re-run these effects
						continue;
					}
				}

				sources.push(source);
			}

			if (is_earlier) {
				// TODO do we need to restart these in some cases, instead of
				// immediately resolving them? Likely not because of how this.apply() works.
				for (const [effect, deferred] of this.async_deriveds) {
					const d = batch.async_deriveds.get(effect);
					if (d) deferred.promise.then(d.resolve).catch(d.reject);
				}
			}

			var current = [...batch.current.keys()].filter(
				(source) => !(/** @type {[any, boolean]} */ (batch.current.get(source))[1])
			);

			// If not started yet or no sources to update (which is e.g. possible for the very first batch) then bail
			if (!batch.#started || current.length === 0) continue;

			// Re-run async/block effects that depend on distinct values changed in both batches (ignoring deriveds)
			var others = current.filter((source) => !this.current.has(source));

			if (others.length === 0) {
				if (is_earlier) {
					// this batch is now obsolete and can be discarded
					batch.discard();
				}
			} else if (sources.length > 0) {
				// The microtask queue can contain the batch already scheduled to run right
				// after this one is finished, so throwing the invariant would be wrong here.
				if (DEV && !batch.#decrement_queued) {
					invariant(batch.#scheduled.length === 0, 'Batch has scheduled effects');
				}

				// A batch was unskipped in a later batch -> tell prior batches to unskip it, too
				if (is_earlier) {
					for (const unskipped of this.#unskipped_branches) {
						batch.unskip_effect(unskipped, (e) => {
							if ((e.f & (BLOCK_EFFECT | ASYNC)) !== 0) {
								batch.schedule(e);
							} else {
								batch.#defer_effects([e]);
							}
						});
					}
				}

				batch.activate();

				/** @type {Set<Value>} */
				var marked = new Set();

				/** @type {Map<Reaction, boolean>} */
				var checked = new Map();

				for (var source of sources) {
					mark_effects(source, others, marked, checked);
				}

				checked = new Map();
				var current_unequal = [...batch.current]
					.filter(([c, v1]) => {
						const v2 = this.current.get(c);
						if (!v2) return true;
						// Either their values are different or one is a derived but not the other
						return v2[0] !== v1[0] || v2[1] !== v1[1];
					})
					.map(([c]) => c);

				if (current_unequal.length > 0) {
					for (const effect of this.#new_effects) {
						if (
							(effect.f & (DESTROYED | INERT | EAGER_EFFECT)) === 0 &&
							depends_on(effect, current_unequal, checked)
						) {
							if ((effect.f & (ASYNC | BLOCK_EFFECT)) !== 0) {
								set_signal_status(effect, DIRTY);
								batch.schedule(effect);
							} else {
								batch.#dirty_effects.add(effect);
							}
						}
					}
				}

				// Only apply and traverse when we know we triggered async work with marking the effects
				// and know this won't run anyway right afterwards
				if (batch.#scheduled.length > 0 && !batch.#decrement_queued) {
					batch.apply();

					for (var root of batch.#resolve()) {
						batch.#traverse(root, [], []);
					}
				}

				batch.deactivate();
			}
		}
	}

	/**
	 * @param {boolean} blocking
	 * @param {Effect} effect
	 */
	increment(blocking, effect) {
		this.#pending += 1;

		if (blocking) {
			let blocking_pending_count = this.#blocking_pending.get(effect) ?? 0;
			this.#blocking_pending.set(effect, blocking_pending_count + 1);
		}
	}

	/**
	 * @param {boolean} blocking
	 * @param {Effect} effect
	 */
	decrement(blocking, effect) {
		this.#pending -= 1;

		if (blocking) {
			let blocking_pending_count = this.#blocking_pending.get(effect) ?? 0;

			if (blocking_pending_count === 1) {
				this.#blocking_pending.delete(effect);
			} else {
				this.#blocking_pending.set(effect, blocking_pending_count - 1);
			}
		}

		if (this.#decrement_queued) return;
		this.#decrement_queued = true;

		queue_micro_task(() => {
			this.#decrement_queued = false;

			if (this.linked) {
				this.flush();
			}
		});
	}

	/**
	 * @param {Set<Effect>} dirty_effects
	 * @param {Set<Effect>} maybe_dirty_effects
	 */
	transfer_effects(dirty_effects, maybe_dirty_effects) {
		for (const e of dirty_effects) {
			this.#dirty_effects.add(e);
		}

		for (const e of maybe_dirty_effects) {
			this.#maybe_dirty_effects.add(e);
		}

		dirty_effects.clear();
		maybe_dirty_effects.clear();
	}

	/** @param {(batch: Batch) => void} fn */
	oncommit(fn) {
		this.#commit_callbacks.add(fn);
	}

	/** @param {(batch: Batch) => void} fn */
	ondiscard(fn) {
		this.#discard_callbacks.add(fn);
	}

	settled() {
		return (this.#deferred ??= deferred()).promise;
	}

	static ensure() {
		if (current_batch === null) {
			const batch = (current_batch = new Batch());

			if (!is_processing && !is_flushing_sync) {
				queue_micro_task(() => {
					if (!batch.#started) {
						batch.flush();
					}
				});
			}
		}

		return current_batch;
	}

	apply() {
		{
			batch_values = null;
			return;
		}
	}

	/**
	 *
	 * @param {Effect} effect
	 */
	schedule(effect) {
		last_scheduled_effect = effect;

		// defer render effects inside a pending boundary
		// TODO the `REACTION_RAN` check is only necessary because of legacy `$:` effects AFAICT — we can remove later
		if (
			effect.b?.is_pending &&
			(effect.f & (EFFECT | RENDER_EFFECT | MANAGED_EFFECT)) !== 0 &&
			(effect.f & REACTION_RAN) === 0
		) {
			effect.b.defer_effect(effect);
			return;
		}

		this.#scheduled.push(effect);
	}

	#unlink() {
		// #merge calls #unlink, discard later on does it again - prevent
		// running it multiple times to not corrupt the linked list
		if (!this.linked) return;

		var prev = this.#prev;
		var next = this.#next;

		if (prev === null) {
			first_batch = next;
		} else {
			prev.#next = next;
		}

		if (next === null) {
			last_batch = prev;
		} else {
			next.#prev = prev;
		}

		this.linked = false;
	}
}

// TODO Svelte@6 think about removing the callback argument.
/**
 * Synchronously flush any pending updates.
 * Returns void if no callback is provided, otherwise returns the result of calling the callback.
 * @template [T=void]
 * @param {(() => T) | undefined} [fn]
 * @returns {T}
 */
function flushSync(fn) {
	var was_flushing_sync = is_flushing_sync;
	var prev_previous_batch = previous_batch;
	previous_batch = null;
	is_flushing_sync = true;

	try {
		var result;

		if (fn) ;

		while (true) {
			flush_tasks();

			if (current_batch === null) {
				return /** @type {T} */ (result);
			}

			current_batch.flush();
		}
	} finally {
		is_flushing_sync = was_flushing_sync;
		previous_batch = prev_previous_batch;
	}
}

function infinite_loop_guard() {
	if (DEV) {
		var updates = new Map();

		for (const source of /** @type {Batch} */ (current_batch).current.keys()) {
			for (const [stack, update] of source.updated ?? []) {
				var entry = updates.get(stack);

				if (!entry) {
					entry = { error: update.error, count: 0 };
					updates.set(stack, entry);
				}

				entry.count += update.count;
			}
		}

		for (const update of updates.values()) {
			if (update.error) {
				// eslint-disable-next-line no-console
				console.error(update.error);
			}
		}
	}

	try {
		effect_update_depth_exceeded();
	} catch (error) {
		if (DEV) {
			// stack contains no useful information, replace it
			define_property(error, 'stack', { value: '' });
		}

		// Best effort: invoke the boundary nearest the most recent
		// effect and hope that it's relevant to the infinite loop
		invoke_error_boundary(error, last_scheduled_effect);
	}
}

/** @type {Set<Effect> | null} */
let eager_block_effects = null;

/**
 * @param {Array<Effect>} effects
 * @returns {void}
 */
function flush_queued_effects(effects) {
	var length = effects.length;
	if (length === 0) return;

	var i = 0;

	while (i < length) {
		var effect = effects[i++];

		if ((effect.f & (DESTROYED | INERT)) === 0 && is_dirty(effect)) {
			eager_block_effects = new Set();

			update_effect(effect);

			// Effects with no dependencies or teardown do not get added to the effect tree.
			// Deferred effects (e.g. `$effect(...)`) _are_ added to the tree because we
			// don't know if we need to keep them until they are executed. Doing the check
			// here (rather than in `update_effect`) allows us to skip the work for
			// immediate effects.
			if (
				effect.deps === null &&
				effect.first === null &&
				effect.nodes === null &&
				effect.teardown === null &&
				effect.ac === null
			) {
				// remove this effect from the graph
				unlink_effect(effect);
			}

			// If update_effect() has a flushSync() in it, we may have flushed another flush_queued_effects(),
			// which already handled this logic and did set eager_block_effects to null.
			if (eager_block_effects?.size > 0) {
				old_values.clear();

				for (const e of eager_block_effects) {
					// Skip eager effects that have already been unmounted
					if ((e.f & (DESTROYED | INERT)) !== 0) continue;

					// Run effects in order from ancestor to descendant, else we could run into nullpointers
					/** @type {Effect[]} */
					const ordered_effects = [e];
					let ancestor = e.parent;
					while (ancestor !== null) {
						if (eager_block_effects.has(ancestor)) {
							eager_block_effects.delete(ancestor);
							ordered_effects.push(ancestor);
						}
						ancestor = ancestor.parent;
					}

					for (let j = ordered_effects.length - 1; j >= 0; j--) {
						const e = ordered_effects[j];
						// Skip eager effects that have already been unmounted
						if ((e.f & (DESTROYED | INERT)) !== 0) continue;
						update_effect(e);
					}
				}

				eager_block_effects.clear();
			}
		}
	}

	eager_block_effects = null;
}

/**
 * This is similar to `mark_reactions`, but it only marks async/block effects
 * depending on `value` and at least one of the other `sources`, so that
 * these effects can re-run after another batch has been committed
 * @param {Value} value
 * @param {Source[]} sources
 * @param {Set<Value>} marked
 * @param {Map<Reaction, boolean>} checked
 */
function mark_effects(value, sources, marked, checked) {
	if (marked.has(value)) return;
	marked.add(value);

	if (value.reactions !== null) {
		for (const reaction of value.reactions) {
			const flags = reaction.f;

			if ((flags & DERIVED) !== 0) {
				mark_effects(/** @type {Derived} */ (reaction), sources, marked, checked);
			} else if (
				(flags & (ASYNC | BLOCK_EFFECT)) !== 0 &&
				(flags & DIRTY) === 0 &&
				depends_on(reaction, sources, checked)
			) {
				set_signal_status(reaction, DIRTY);
				schedule_effect(/** @type {Effect} */ (reaction));
			}
		}
	}
}

/**
 * @param {Reaction} reaction
 * @param {Source[]} sources
 * @param {Map<Reaction, boolean>} checked
 */
function depends_on(reaction, sources, checked) {
	const depends = checked.get(reaction);
	if (depends !== undefined) return depends;

	if (reaction.deps !== null) {
		for (const dep of reaction.deps) {
			if (includes.call(sources, dep)) {
				return true;
			}

			if ((dep.f & DERIVED) !== 0 && depends_on(/** @type {Derived} */ (dep), sources, checked)) {
				checked.set(/** @type {Derived} */ (dep), true);
				return true;
			}
		}
	}

	checked.set(reaction, false);

	return false;
}

/**
 * @param {Effect} effect
 * @returns {void}
 */
function schedule_effect(effect) {
	/** @type {Batch} */ (current_batch).schedule(effect);
}

/**
 * Mark all the effects inside a skipped branch CLEAN, so that
 * they can be correctly rescheduled later. Tracks dirty and maybe_dirty
 * effects so they can be rescheduled if the branch survives.
 * @param {Effect} effect
 * @param {{ d: Effect[], m: Effect[] }} tracked
 */
function reset_branch(effect, tracked) {
	// clean branch = nothing dirty inside, no need to traverse further
	if ((effect.f & BRANCH_EFFECT) !== 0 && (effect.f & CLEAN) !== 0) {
		return;
	}

	if ((effect.f & DIRTY) !== 0) {
		tracked.d.push(effect);
	} else if ((effect.f & MAYBE_DIRTY) !== 0) {
		tracked.m.push(effect);
	}

	set_signal_status(effect, CLEAN);

	var e = effect.first;
	while (e !== null) {
		reset_branch(e, tracked);
		e = e.next;
	}
}

/**
 * Mark an entire effect tree clean following an error
 * @param {Effect} effect
 */
function reset_all(effect) {
	set_signal_status(effect, CLEAN);

	var e = effect.first;
	while (e !== null) {
		reset_all(e);
		e = e.next;
	}
}

/** @import { Derived, Effect, Source, Value } from '#client' */

/** @type {Set<Effect>} */
let eager_effects = new Set();

/** @type {Map<Value, any>} */
const old_values = new Map();

/**
 * @param {Set<any>} v
 */
function set_eager_effects(v) {
	eager_effects = v;
}

let eager_effects_deferred = false;

function set_eager_effects_deferred() {
	eager_effects_deferred = true;
}

/**
 * @template V
 * @param {V} v
 * @param {Error | null} [stack]
 * @returns {Source<V>}
 */
// TODO rename this to `state` throughout the codebase
function source(v, stack) {
	/** @type {Value} */
	var signal = {
		f: 0, // TODO ideally we could skip this altogether, but it causes type errors
		v,
		reactions: null,
		equals,
		rv: 0,
		wv: 0
	};

	return signal;
}

/**
 * @template V
 * @param {V} v
 * @param {Error | null} [stack]
 */
/*#__NO_SIDE_EFFECTS__*/
function state(v, stack) {
	const s = source(v);

	push_reaction_value(s);

	return s;
}

/**
 * @template V
 * @param {V} initial_value
 * @param {boolean} [immutable]
 * @returns {Source<V>}
 */
/*#__NO_SIDE_EFFECTS__*/
function mutable_source(initial_value, immutable = false, trackable = true) {
	const s = source(initial_value);
	if (!immutable) {
		s.equals = safe_equals;
	}

	// bind the signal to the component context, in case we need to
	// track updates to trigger beforeUpdate/afterUpdate callbacks
	if (legacy_mode_flag && trackable && component_context !== null && component_context.l !== null) {
		(component_context.l.s ??= []).push(s);
	}

	return s;
}

/**
 * @template V
 * @param {Value<V>} source
 * @param {V} value
 * @param {boolean} [should_proxy]
 * @returns {V}
 */
function set(source, value, should_proxy = false) {
	if (
		active_reaction !== null &&
		// since we are untracking the function inside `$inspect.with` we need to add this check
		// to ensure we error if state is set inside an inspect effect
		(!untracking || (active_reaction.f & EAGER_EFFECT) !== 0) &&
		is_runes() &&
		(active_reaction.f & (DERIVED | BLOCK_EFFECT | ASYNC | EAGER_EFFECT)) !== 0 &&
		(current_sources === null || !current_sources.has(source))
	) {
		state_unsafe_mutation();
	}

	let new_value = should_proxy ? proxy(value) : value;

	if (DEV) {
		tag_proxy(new_value, /** @type {string} */ (source.label));
	}

	return internal_set(source, new_value, legacy_updates);
}

/**
 * A set of signals we have already seen while traversing in mark_reactions.
 * Not always set to balance the common case of sources only having a couple
 * of (transitive) dependencies (where always creating a Set would be bad for perf)
 * with the edge case of extremely deep or wide dependency arrays with cycles.
 * @type {Set<any> | null}
 */
var seen = null;
/** Number of transitive dependencies, see {@link seen} for more info */
var count_deps = 0;

/**
 * @template V
 * @param {Value<V>} source
 * @param {V} value
 * @param {Effect[] | null} [updated_during_traversal]
 * @returns {V}
 */
function internal_set(source, value, updated_during_traversal = null) {
	if (!source.equals(value)) {
		if (is_destroying_effect) {
			old_values.set(source, value);
		} else if (!old_values.has(source)) {
			// only record the value from before the first write in this flush, otherwise a
			// teardown would see the value from before whichever write happened to be last
			old_values.set(source, source.v);
		}

		var batch = Batch.ensure();
		batch.capture(source, value);

		if (DEV) {
			if (active_effect !== null) {
				source.updated ??= new Map();

				// For performance reasons, when not using $inspect.trace, we only start collecting stack traces
				// after the same source has been updated more than 5 times in the same flush cycle.
				const count = (source.updated.get('')?.count ?? 0) + 1;
				source.updated.set('', { error: /** @type {any} */ (null), count });

				if (count > 5) {
					const error = get_error('updated at');

					if (error !== null) {
						let entry = source.updated.get(error.stack);

						if (!entry) {
							entry = { error, count: 0 };
							source.updated.set(error.stack, entry);
						}

						entry.count++;
					}
				}
			}

			if (active_effect !== null) {
				source.set_during_effect = true;
			}
		}

		if ((source.f & DERIVED) !== 0) {
			const derived = /** @type {Derived} */ (source);

			// if we are assigning to a dirty derived we set it to clean/maybe dirty but we also eagerly execute it to track the dependencies
			if ((source.f & DIRTY) !== 0) {
				execute_derived(derived);
			}

			// During time traveling we don't want to reset the status so that
			// traversal of the graph in the other batches still happens
			if (batch_values === null) {
				update_derived_status(derived);
			}
		}

		source.wv = increment_write_version();

		// For debugging, in case you want to know which reactions are being scheduled:
		// log_reactions(source);
		seen = null;
		count_deps = 0;
		mark_reactions(source, DIRTY, updated_during_traversal);
		seen = null;

		// It's possible that the current reaction might not have up-to-date dependencies
		// whilst it's actively running. So in the case of ensuring it registers the reaction
		// properly for itself, we need to ensure the current effect actually gets
		// scheduled. i.e: `$effect(() => x++)`
		if (
			is_runes() &&
			active_effect !== null &&
			(active_effect.f & CLEAN) !== 0 &&
			(active_effect.f & (BRANCH_EFFECT | ROOT_EFFECT)) === 0
		) {
			if (untracked_writes === null) {
				set_untracked_writes([source]);
			} else {
				untracked_writes.push(source);
			}
		}

		if (!batch.is_fork && eager_effects.size > 0 && !eager_effects_deferred) {
			flush_eager_effects();
		}
	}

	return value;
}

function flush_eager_effects() {
	eager_effects_deferred = false;

	for (const effect of eager_effects) {
		// Mark clean inspect-effects as maybe dirty and then check their dirtiness
		// instead of just updating the effects - this way we avoid overfiring.
		if ((effect.f & CLEAN) !== 0) {
			set_signal_status(effect, MAYBE_DIRTY);
		}

		let dirty;

		try {
			dirty = is_dirty(effect);
		} catch {
			// Dirty-checking can evaluate derived dependencies and throw in cases where
			// parent effects are about to destroy this eager effect. Run the effect so
			// its own error handling can deal with transient failures.
			dirty = true;
		}

		if (dirty) {
			update_effect(effect);
		}
	}

	eager_effects.clear();
}

/**
 * Silently (without using `get`) increment a source
 * @param {Source<number>} source
 */
function increment(source) {
	set(source, source.v + 1);
}

/**
 * @param {Value} signal
 * @param {number} status should be DIRTY or MAYBE_DIRTY
 * @param {Effect[] | null} updated_during_traversal
 * @returns {void}
 */
function mark_reactions(signal, status, updated_during_traversal) {
	var reactions = signal.reactions;
	if (reactions === null) return;

	var runes = is_runes();
	var length = reactions.length;

	count_deps += length;
	// Activate the `seen` Set if we think from the unusually high number of deps that
	// there might be cycles in the graph, to avoid repeated lookups for reactions
	// Example: https://github.com/sveltejs/svelte/issues/16658 has a graph with one source
	// reaching ~10000 distinct deriveds/effects each, resulting in 65 million walks through repeated visits.
	if (count_deps > 100000 && seen === null) seen = new Set();

	if (seen !== null) {
		if (seen.has(signal)) return;
		seen.add(signal);
	}

	for (var i = 0; i < length; i++) {
		var reaction = reactions[i];
		var flags = reaction.f;

		// In legacy mode, skip the current effect to prevent infinite loops
		if (!runes && reaction === active_effect) continue;

		var not_dirty = (flags & DIRTY) === 0;

		// don't set a DIRTY reaction to MAYBE_DIRTY
		if (not_dirty) {
			set_signal_status(reaction, status);
		}

		if ((flags & EAGER_EFFECT) !== 0) {
			// Eager effects need to run immediately:
			// - for $inspect so that the stack trace makes sense
			// - for $state.eager because they might be without an effect parent
			eager_effects.add(/** @type {Effect} */ (reaction));
		} else if ((flags & DERIVED) !== 0) {
			var derived = /** @type {Derived} */ (reaction);

			batch_values?.delete(derived);
			mark_reactions(derived, MAYBE_DIRTY, updated_during_traversal);
		} else if (not_dirty) {
			var effect = /** @type {Effect} */ (reaction);

			if ((flags & BLOCK_EFFECT) !== 0 && eager_block_effects !== null) {
				eager_block_effects.add(effect);
			}

			if (updated_during_traversal !== null) {
				updated_during_traversal.push(effect);
			} else {
				schedule_effect(effect);
			}
		}
	}
}

/** @import { Source } from '#client' */

// TODO move all regexes into shared module?
const regex_is_valid_identifier = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function proxy(value) {
	// if non-proxyable, a component instance, or already a proxy, return `value`
	if (
		typeof value !== 'object' ||
		value === null ||
		STATE_SYMBOL in value ||
		COMPONENT_SYMBOL in value
	) {
		return value;
	}

	const prototype = get_prototype_of(value);

	if (prototype !== object_prototype && prototype !== array_prototype) {
		return value;
	}

	/** @type {Map<any, Source<any>>} */
	var sources = new Map();
	var is_proxied_array = is_array(value);
	var version = state(0);
	var parent_version = update_version;

	/**
	 * Executes the proxy in the context of the reaction it was originally created in, if any
	 * @template T
	 * @param {() => T} fn
	 */
	var with_parent = (fn) => {
		if (update_version === parent_version) {
			return fn();
		}

		// child source is being created after the initial proxy —
		// prevent it from being associated with the current reaction
		var reaction = active_reaction;
		var version = update_version;

		set_active_reaction(null);
		set_update_version(parent_version);

		var result = fn();

		set_active_reaction(reaction);
		set_update_version(version);

		return result;
	};

	if (is_proxied_array) {
		// We need to create the length source eagerly to ensure that
		// mutations to the array are properly synced with our proxy
		sources.set('length', state(/** @type {any[]} */ (value).length));
		if (DEV) {
			value = /** @type {any} */ (inspectable_array(/** @type {any[]} */ (value)));
		}
	}

	/** Used in dev for $inspect.trace() */
	var path = '';
	let updating = false;
	/** @param {string} new_path */
	function update_path(new_path) {
		if (updating) return;
		updating = true;
		path = new_path;

		tag(version, `${path} version`);

		// rename all child sources and child proxies
		for (const [prop, source] of sources) {
			tag(source, get_label(path, prop));
		}
		updating = false;
	}

	return new Proxy(/** @type {any} */ (value), {
		defineProperty(_, prop, descriptor) {
			if (
				!('value' in descriptor) ||
				descriptor.configurable === false ||
				descriptor.enumerable === false ||
				descriptor.writable === false
			) {
				// we disallow non-basic descriptors, because unless they are applied to the
				// target object — which we avoid, so that state can be forked — we will run
				// afoul of the various invariants
				// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/getOwnPropertyDescriptor#invariants
				state_descriptors_fixed();
			}
			var s = sources.get(prop);
			if (s === undefined) {
				with_parent(() => {
					var s = state(descriptor.value);
					sources.set(prop, s);
					if (DEV && typeof prop === 'string') {
						tag(s, get_label(path, prop));
					}
					return s;
				});
			} else {
				set(s, descriptor.value, true);
			}

			return true;
		},

		deleteProperty(target, prop) {
			var s = sources.get(prop);

			if (s === undefined) {
				if (prop in target) {
					const s = with_parent(() => state(UNINITIALIZED));
					sources.set(prop, s);
					increment(version);

					if (DEV) {
						tag(s, get_label(path, prop));
					}
				}
			} else {
				set(s, UNINITIALIZED);
				increment(version);
			}

			return true;
		},

		get(target, prop, receiver) {
			if (prop === STATE_SYMBOL) {
				return value;
			}

			if (DEV && prop === PROXY_PATH_SYMBOL) {
				return update_path;
			}

			var s = sources.get(prop);
			var exists = prop in target;

			// create a source, but only if it's an own property and not a prototype property
			if (s === undefined && (!exists || get_descriptor(target, prop)?.writable)) {
				s = with_parent(() => {
					var p = proxy(exists ? target[prop] : UNINITIALIZED);
					var s = state(p);

					if (DEV) {
						tag(s, get_label(path, prop));
					}

					return s;
				});

				sources.set(prop, s);
			}

			if (s !== undefined) {
				var v = get(s);
				return v === UNINITIALIZED ? undefined : v;
			}

			return Reflect.get(target, prop, receiver);
		},

		getOwnPropertyDescriptor(target, prop) {
			this.has?.(target, prop);

			var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
			var s = sources.get(prop);

			if (s !== undefined) {
				var value = get(s);

				if (value === UNINITIALIZED) {
					return undefined;
				}

				if (descriptor && 'value' in descriptor) {
					descriptor.value = value;
				} else {
					return {
						enumerable: true,
						configurable: true,
						value,
						writable: true
					};
				}
			}

			return descriptor;
		},

		has(target, prop) {
			if (prop === STATE_SYMBOL) {
				return true;
			}

			var s = sources.get(prop);
			var has = (s !== undefined && s.v !== UNINITIALIZED) || Reflect.has(target, prop);

			if (
				s !== undefined ||
				(active_effect !== null && (!has || get_descriptor(target, prop)?.writable))
			) {
				if (s === undefined) {
					s = with_parent(() => {
						var p = has ? proxy(target[prop]) : UNINITIALIZED;
						var s = state(p);

						if (DEV) {
							tag(s, get_label(path, prop));
						}

						return s;
					});

					sources.set(prop, s);
				}

				var value = get(s);
				if (value === UNINITIALIZED) {
					return false;
				}
			}

			return has;
		},

		set(target, prop, value, receiver) {
			var s = sources.get(prop);
			var has = prop in target;

			// variable.length = value -> clear all signals with index >= value
			if (is_proxied_array && prop === 'length') {
				for (var i = value; i < /** @type {Source<number>} */ (s).v; i += 1) {
					var other_s = sources.get(i + '');
					if (other_s !== undefined) {
						set(other_s, UNINITIALIZED);
					} else if (i in target) {
						// If the item exists in the original, we need to create an uninitialized source,
						// else a later read of the property would result in a source being created with
						// the value of the original item at that index.
						other_s = with_parent(() => state(UNINITIALIZED));
						sources.set(i + '', other_s);

						if (DEV) {
							tag(other_s, get_label(path, i));
						}
					}
				}
			}

			// If we haven't yet created a source for this property, we need to ensure
			// we do so otherwise if we read it later, then the write won't be tracked and
			// the heuristics of effects will be different vs if we had read the proxied
			// object property before writing to that property.
			if (s === undefined) {
				if (!has || get_descriptor(target, prop)?.writable) {
					s = with_parent(() => state(undefined));

					if (DEV) {
						tag(s, get_label(path, prop));
					}
					set(s, proxy(value));

					sources.set(prop, s);
				}
			} else {
				has = s.v !== UNINITIALIZED;

				var p = with_parent(() => proxy(value));
				set(s, p);
			}

			var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);

			// Set the new value before updating any signals so that any listeners get the new value
			if (descriptor?.set) {
				descriptor.set.call(receiver, value);
			}

			if (!has) {
				// If we have mutated an array directly, we might need to
				// signal that length has also changed. Do it before updating metadata
				// to ensure that iterating over the array as a result of a metadata update
				// will not cause the length to be out of sync.
				if (is_proxied_array && typeof prop === 'string') {
					var ls = /** @type {Source<number>} */ (sources.get('length'));
					var n = Number(prop);

					if (Number.isInteger(n) && n >= ls.v) {
						set(ls, n + 1);
					}
				}

				increment(version);
			}

			return true;
		},

		ownKeys(target) {
			get(version);

			var own_keys = Reflect.ownKeys(target).filter((key) => {
				var source = sources.get(key);
				return source === undefined || source.v !== UNINITIALIZED;
			});

			for (var [key, source] of sources) {
				if (source.v !== UNINITIALIZED && !(key in target)) {
					own_keys.push(key);
				}
			}

			return own_keys;
		},

		setPrototypeOf() {
			state_prototype_fixed();
		}
	});
}

/**
 * @param {string} path
 * @param {string | symbol} prop
 */
function get_label(path, prop) {
	if (typeof prop === 'symbol') return `${path}[Symbol(${prop.description ?? ''})]`;
	if (regex_is_valid_identifier.test(prop)) return `${path}.${prop}`;
	return /^\d+$/.test(prop) ? `${path}[${prop}]` : `${path}['${prop}']`;
}

/**
 * @param {any} value
 */
function get_proxied_value(value) {
	try {
		if (value !== null && typeof value === 'object' && STATE_SYMBOL in value) {
			return value[STATE_SYMBOL];
		}
	} catch {
		// the above if check can throw an error if the value in question
		// is the contentWindow of an iframe on another domain, in which
		// case we want to just return the value (because it's definitely
		// not a proxied value) so we don't break any JavaScript interacting
		// with that iframe (such as various payment companies client side
		// JavaScript libraries interacting with their iframes on the same
		// domain)
	}

	return value;
}

const ARRAY_MUTATING_METHODS = new Set([
	'copyWithin',
	'fill',
	'pop',
	'push',
	'reverse',
	'shift',
	'sort',
	'splice',
	'unshift'
]);

/**
 * Wrap array mutating methods so $inspect is triggered only once and
 * to prevent logging an array in intermediate state (e.g. with an empty slot)
 * @param {any[]} array
 */
function inspectable_array(array) {
	return new Proxy(array, {
		get(target, prop, receiver) {
			var value = Reflect.get(target, prop, receiver);
			if (!ARRAY_MUTATING_METHODS.has(/** @type {string} */ (prop))) {
				return value;
			}

			/**
			 * @this {any[]}
			 * @param {any[]} args
			 */
			return function (...args) {
				set_eager_effects_deferred();
				var result = value.apply(this, args);
				flush_eager_effects();
				return result;
			};
		}
	});
}

function init_array_prototype_warnings() {
	const array_prototype = Array.prototype;
	// The REPL ends up here over and over, and this prevents it from adding more and more patches
	// of the same kind to the prototype, which would slow down everything over time.
	// @ts-expect-error
	const cleanup = Array.__svelte_cleanup;
	if (cleanup) {
		cleanup();
	}

	const { indexOf, lastIndexOf, includes } = array_prototype;

	array_prototype.indexOf = function (item, from_index) {
		const index = indexOf.call(this, item, from_index);

		if (index === -1) {
			for (let i = from_index ?? 0; i < this.length; i += 1) {
				if (get_proxied_value(this[i]) === item) {
					state_proxy_equality_mismatch('array.indexOf(...)');
					break;
				}
			}
		}

		return index;
	};

	array_prototype.lastIndexOf = function (item, from_index) {
		// we need to specify this.length - 1 because it's probably using something like
		// `arguments` inside so passing undefined is different from not passing anything
		const index = lastIndexOf.call(this, item, from_index ?? this.length - 1);

		if (index === -1) {
			for (let i = 0; i <= (from_index ?? this.length - 1); i += 1) {
				if (get_proxied_value(this[i]) === item) {
					state_proxy_equality_mismatch('array.lastIndexOf(...)');
					break;
				}
			}
		}

		return index;
	};

	array_prototype.includes = function (item, from_index) {
		const has = includes.call(this, item, from_index);

		if (!has) {
			for (let i = 0; i < this.length; i += 1) {
				if (get_proxied_value(this[i]) === item) {
					state_proxy_equality_mismatch('array.includes(...)');
					break;
				}
			}
		}

		return has;
	};

	// @ts-expect-error
	Array.__svelte_cleanup = () => {
		array_prototype.indexOf = indexOf;
		array_prototype.lastIndexOf = lastIndexOf;
		array_prototype.includes = includes;
	};
}

/** @import { Effect, TemplateNode } from '#client' */

// export these for reference in the compiled code, making global name deduplication unnecessary
/** @type {Window} */
var $window;

/** @type {boolean} */
var is_firefox;

/** @type {() => Node | null} */
var first_child_getter;
/** @type {() => Node | null} */
var next_sibling_getter;

/**
 * Initialize these lazily to avoid issues when using the runtime in a server context
 * where these globals are not available while avoiding a separate server entry point
 */
function init_operations() {
	if ($window !== undefined) {
		return;
	}

	$window = window;
	is_firefox = /Firefox/.test(navigator.userAgent);

	var element_prototype = Element.prototype;
	var node_prototype = Node.prototype;
	var text_prototype = Text.prototype;

	// @ts-ignore
	first_child_getter = get_descriptor(node_prototype, 'firstChild').get;
	// @ts-ignore
	next_sibling_getter = get_descriptor(node_prototype, 'nextSibling').get;

	if (is_extensible(element_prototype)) {
		// the following assignments improve perf of lookups on DOM nodes
		/** @type {any} */ (element_prototype)[CLASS_CACHE] = undefined;
		/** @type {any} */ (element_prototype)[ATTRIBUTES_CACHE] = null;
		/** @type {any} */ (element_prototype)[STYLE_CACHE] = undefined;
		// @ts-expect-error
		element_prototype.__e = undefined;
	}

	if (is_extensible(text_prototype)) {
		/** @type {any} */ (text_prototype)[TEXT_CACHE] = undefined;
	}

	if (DEV) {
		// @ts-expect-error
		element_prototype.__svelte_meta = null;

		init_array_prototype_warnings();
	}
}

/**
 * @param {string} value
 * @returns {Text}
 */
function create_text(value = '') {
	return document.createTextNode(value);
}

/**
 * @template {Node} N
 * @param {N} node
 */
/*@__NO_SIDE_EFFECTS__*/
function get_first_child(node) {
	return /** @type {TemplateNode | null} */ (first_child_getter.call(node));
}

/**
 * @template {Node} N
 * @param {N} node
 */
/*@__NO_SIDE_EFFECTS__*/
function get_next_sibling(node) {
	return /** @type {TemplateNode | null} */ (next_sibling_getter.call(node));
}

/**
 * Don't mark this as side-effect-free, hydration needs to walk all nodes
 * @template {Node} N
 * @param {N} node
 * @param {boolean} is_text
 * @returns {TemplateNode | null}
 */
function child(node, is_text) {
	{
		return get_first_child(node);
	}
}

/**
 * Don't mark this as side-effect-free, hydration needs to walk all nodes
 * @param {TemplateNode} node
 * @param {boolean} [is_text]
 * @returns {TemplateNode | null}
 */
function first_child(node, is_text = false) {
	{
		var first = get_first_child(node);

		// TODO prevent user comments with the empty string when preserveComments is true
		if (first instanceof Comment && first.data === '') return get_next_sibling(first);

		return first;
	}
}

/**
 * `child`, for the very common case of an element with exactly one child. Resetting the
 * hydration cursor is part of the same step, so the compiler doesn't have to emit a
 * separate `reset` call for every `<p>{text}</p>` in an app.
 * Don't mark this as side-effect-free, hydration needs to walk all nodes
 * @param {TemplateNode} node
 * @param {boolean} [is_text]
 * @returns {TemplateNode | null}
 */
function only_child(node, is_text = false) {
	{
		return get_first_child(node);
	}
}

/**
 * Don't mark this as side-effect-free, hydration needs to walk all nodes
 * @param {TemplateNode} node
 * @param {number} count
 * @param {boolean} is_text
 * @returns {TemplateNode | null}
 */
function sibling(node, count = 1, is_text = false) {
	let next_sibling = node;

	while (count--) {
		next_sibling = /** @type {TemplateNode} */ (get_next_sibling(next_sibling));
	}

	{
		return next_sibling;
	}
}

/**
 * @template {Node} N
 * @param {N} node
 * @returns {void}
 */
function clear_text_content(node) {
	node.textContent = '';
}

/**
 * Returns `true` if we're updating the current block, for example `condition` in
 * an `{#if condition}` block just changed. In this case, the branch should be
 * appended (or removed) at the same time as other updates within the
 * current `<svelte:boundary>`
 */
function should_defer_append() {
	return false;
}

/**
 * Branching here is intentional and load-bearing for perf. `createElement(tag)`
 * hits a fast path in Blink that `createElementNS(NAMESPACE_HTML, tag)` doesn't,
 * and passing an explicit `undefined` as the trailing options arg measurably
 * slows both APIs. Funnelling every case through a single `createElementNS(ns,
 * tag, options)` call would be smaller but slower on the HTML path.
 *
 * @template {keyof HTMLElementTagNameMap | string} T
 * @param {T} tag
 * @param {string} [namespace]
 * @param {string} [is]
 * @returns {T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : Element}
 */
function create_element(tag, namespace, is) {
	if (namespace == null || namespace === NAMESPACE_HTML) {
		return /** @type {T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : Element} */ (
			is ? document.createElement(tag, { is }) : document.createElement(tag)
		);
	}
	return /** @type {T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : Element} */ (
		is ? document.createElementNS(namespace, tag, { is }) : document.createElementNS(namespace, tag)
	);
}

/** @import { Derived, Effect } from '#client' */
/** @import { Boundary } from './dom/blocks/boundary.js' */

const adjustments = new WeakMap();

/**
 * @param {unknown} error
 */
function handle_error(error) {
	var effect = active_effect;

	// for unowned deriveds, don't throw until we read the value
	if (effect === null) {
		/** @type {Derived} */ (active_reaction).f |= ERROR_VALUE;
		return error;
	}

	if (DEV && error instanceof Error && !adjustments.has(error)) {
		adjustments.set(error, get_adjustments(error, effect));
	}

	// if the error occurred while creating this subtree, we let it
	// bubble up until it hits a boundary that can handle it, unless
	// it's an $effect in which case it doesn't run immediately
	if ((effect.f & REACTION_RAN) === 0 && (effect.f & EFFECT) === 0) {
		if (DEV && !effect.parent && error instanceof Error) {
			apply_adjustments(error);
		}

		throw error;
	}

	// otherwise we bubble up the effect tree ourselves
	invoke_error_boundary(error, effect);
}

/**
 * @param {unknown} error
 * @param {Effect | null} effect
 */
function invoke_error_boundary(error, effect) {
	if (error === HYDRATION_ERROR) {
		throw error;
	}

	if (effect !== null && (effect.f & DESTROYED) !== 0) {
		return;
	}

	while (effect !== null) {
		// Skip boundaries that are destroyed/destroying and cannot meaningfully handle the error.
		if ((effect.f & BOUNDARY_EFFECT) !== 0 && (effect.f & (DESTROYED | DESTROYING)) === 0) {
			if ((effect.f & REACTION_RAN) === 0) {
				// we are still creating the boundary effect
				throw error;
			}

			try {
				/** @type {Boundary} */ (effect.b).error(error);
				return;
			} catch (e) {
				error = e;
			}
		}

		effect = effect.parent;
	}

	if (DEV && error instanceof Error) {
		apply_adjustments(error);
	}

	throw error;
}

/**
 * Add useful information to the error message/stack in development
 * @param {Error} error
 * @param {Effect} effect
 */
function get_adjustments(error, effect) {
	const message_descriptor = get_descriptor(error, 'message');

	// if the message was already changed and it's not configurable we can't change it
	// or it will throw a different error swallowing the original error
	if (message_descriptor && !message_descriptor.configurable) return;

	var indent = is_firefox ? '  ' : '\t';
	var component_stack = `\n${indent}in ${effect.fn?.name || '<unknown>'}`;
	var context = effect.ctx;

	while (context !== null) {
		component_stack += `\n${indent}in ${context.function?.[FILENAME].split('/').pop()}`;
		context = context.p;
	}

	return {
		message: error.message + `\n${component_stack}\n`,
		stack: error.stack
			?.split('\n')
			.filter((line) => !line.includes('svelte/src/internal'))
			.join('\n')
	};
}

/**
 * @param {Error} error
 */
function apply_adjustments(error) {
	const adjusted = adjustments.get(error);

	if (adjusted) {
		define_property(error, 'message', {
			value: adjusted.message
		});

		define_property(error, 'stack', {
			value: adjusted.stack
		});
	}
}

/** @import { Blocker, ComponentContext, ComponentContextLegacy, Derived, Effect, TemplateNode, TransitionManager } from '#client' */

/**
 * @param {'$effect' | '$effect.pre' | '$inspect'} rune
 */
function validate_effect(rune) {
	if (active_effect === null) {
		if (active_reaction === null) {
			effect_orphan(rune);
		}

		effect_in_unowned_derived();
	}

	if (is_destroying_effect) {
		effect_in_teardown(rune);
	}
}

/**
 * @param {Effect} effect
 * @param {Effect} parent_effect
 */
function push_effect(effect, parent_effect) {
	var parent_last = parent_effect.last;
	if (parent_last === null) {
		parent_effect.last = parent_effect.first = effect;
	} else {
		parent_last.next = effect;
		effect.prev = parent_last;
		parent_effect.last = effect;
	}
}

/**
 * @param {number} type
 * @param {null | (() => void | (() => void))} fn
 * @returns {Effect}
 */
function create_effect(type, fn) {
	var parent = active_effect;

	if (DEV) {
		// Ensure the parent is never an inspect effect
		while (parent !== null && (parent.f & EAGER_EFFECT) !== 0) {
			parent = parent.parent;
		}
	}

	if (parent !== null && (parent.f & INERT) !== 0) {
		type |= INERT;
	}

	/** @type {Effect} */
	var effect = {
		ctx: component_context,
		deps: null,
		nodes: null,
		f: type | DIRTY | CONNECTED,
		first: null,
		fn,
		last: null,
		next: null,
		parent,
		b: parent && parent.b,
		prev: null,
		teardown: null,
		wv: 0,
		ac: null
	};

	if (DEV) {
		effect.component_function = dev_current_component_function;
	}

	current_batch?.register_created_effect(effect);

	/** @type {Effect | null} */
	var e = effect;

	if ((type & EFFECT) !== 0) {
		if (collected_effects !== null) {
			// created during traversal — collect and run afterwards
			collected_effects.push(effect);
		} else {
			// schedule for later
			Batch.ensure().schedule(effect);
		}
	} else if (fn !== null) {
		try {
			update_effect(effect);
		} catch (e) {
			destroy_effect(effect);
			throw e;
		}

		// if an effect doesn't need to be kept in the tree (because it
		// won't re-run, has no DOM, and has no teardown etc)
		// then we skip it and go to its child (if any)
		if (
			e.deps === null &&
			e.teardown === null &&
			e.nodes === null &&
			e.first === e.last && // either `null`, or a singular child
			(e.f & EFFECT_PRESERVED) === 0
		) {
			e = e.first;
			if ((type & BLOCK_EFFECT) !== 0 && (type & EFFECT_TRANSPARENT) !== 0 && e !== null) {
				e.f |= EFFECT_TRANSPARENT;
			}
		}
	}

	if (e !== null) {
		e.parent = parent;

		if (parent !== null) {
			push_effect(e, parent);
		}

		// if we're in a derived, add the effect there too
		if (
			active_reaction !== null &&
			(active_reaction.f & DERIVED) !== 0 &&
			(type & ROOT_EFFECT) === 0
		) {
			var derived = /** @type {Derived} */ (active_reaction);
			(derived.effects ??= []).push(e);
		}
	}

	return effect;
}

/**
 * Internal representation of `$effect.tracking()`
 * @returns {boolean}
 */
function effect_tracking() {
	return active_reaction !== null && !untracking;
}

/**
 * @param {() => void} fn
 */
function teardown(fn) {
	const effect = create_effect(RENDER_EFFECT, null);
	set_signal_status(effect, CLEAN);
	effect.teardown = fn;
	return effect;
}

/**
 * Internal representation of `$effect(...)`
 * @param {() => void | (() => void)} fn
 */
function user_effect(fn) {
	validate_effect('$effect');

	if (DEV) {
		define_property(fn, 'name', {
			value: '$effect'
		});
	}

	// Non-nested `$effect(...)` in a component should be deferred
	// until the component is mounted
	var flags = /** @type {Effect} */ (active_effect).f;
	var defer =
		!active_reaction &&
		(flags & BRANCH_EFFECT) !== 0 &&
		component_context !== null &&
		!component_context.i;

	if (defer) {
		// Top-level `$effect(...)` in an unmounted component — defer until mount
		var context = /** @type {ComponentContext} */ (component_context);
		(context.e ??= []).push(fn);
	} else {
		// Everything else — create immediately
		return create_user_effect(fn);
	}
}

/**
 * @param {() => void | (() => void)} fn
 */
function create_user_effect(fn) {
	return create_effect(EFFECT | USER_EFFECT, fn);
}

/**
 * Internal representation of `$effect.pre(...)`
 * @param {() => void | (() => void)} fn
 * @returns {Effect}
 */
function user_pre_effect(fn) {
	validate_effect('$effect.pre');
	if (DEV) {
		define_property(fn, 'name', {
			value: '$effect.pre'
		});
	}
	return create_effect(RENDER_EFFECT | USER_EFFECT, fn);
}

/**
 * An effect root whose children can transition out
 * @param {() => void} fn
 * @returns {(options?: { outro?: boolean }) => Promise<void>}
 */
function component_root(fn) {
	Batch.ensure();
	const effect = create_effect(ROOT_EFFECT | EFFECT_PRESERVED, fn);

	return (options = {}) => {
		return new Promise((fulfil) => {
			if (options.outro) {
				pause_effect(effect, () => {
					destroy_effect(effect);
					fulfil(undefined);
				});
			} else {
				destroy_effect(effect);
				fulfil(undefined);
			}
		});
	};
}

/**
 * @param {() => void | (() => void)} fn
 * @returns {Effect}
 */
function effect(fn) {
	return create_effect(EFFECT, fn);
}

/**
 * @param {() => void | (() => void)} fn
 * @returns {Effect}
 */
function async_effect(fn) {
	return create_effect(ASYNC | EFFECT_PRESERVED, fn);
}

/**
 * @param {() => void | (() => void)} fn
 * @returns {Effect}
 */
function render_effect(fn, flags = 0) {
	return create_effect(RENDER_EFFECT | flags, fn);
}

/**
 * @param {(...expressions: any) => void | (() => void)} fn
 * @param {Array<() => any>} sync
 * @param {Array<() => Promise<any>>} async
 * @param {Blocker[]} blockers
 */
function template_effect(fn, sync = [], async = [], blockers = []) {
	flatten(blockers, sync, async, (values) => {
		create_effect(RENDER_EFFECT, () => {
			fn(...values.map(get));
		});
	});
}

/**
 * @param {(() => void)} fn
 * @param {number} flags
 */
function block(fn, flags = 0) {
	var effect = create_effect(BLOCK_EFFECT | flags, fn);
	if (DEV) {
		effect.dev_stack = dev_stack;
	}
	return effect;
}

/**
 * @param {(() => void)} fn
 */
function branch(fn) {
	return create_effect(BRANCH_EFFECT | EFFECT_PRESERVED, fn);
}

/**
 * @param {Effect} effect
 */
function execute_effect_teardown(effect) {
	var teardown = effect.teardown;
	if (teardown !== null) {
		const previously_destroying_effect = is_destroying_effect;
		const previous_reaction = active_reaction;
		set_is_destroying_effect(true);
		set_active_reaction(null);
		try {
			teardown.call(null);
		} catch (error) {
			// Route teardown errors through the boundary system so that a live
			// ancestor <svelte:boundary> can handle them. Boundaries that are
			// themselves mid-teardown are skipped by invoke_error_boundary.
			invoke_error_boundary(error, effect.parent);
		} finally {
			set_is_destroying_effect(previously_destroying_effect);
			set_active_reaction(previous_reaction);
		}
	}
}

/**
 * @param {Effect} signal
 * @param {boolean} remove_dom
 * @returns {void}
 */
function destroy_effect_children(signal, remove_dom = false) {
	var effect = signal.first;
	signal.first = signal.last = null;

	while (effect !== null) {
		const controller = effect.ac;

		if (controller !== null) {
			without_reactive_context(() => {
				controller.abort(STALE_REACTION);
			});
		}

		var next = effect.next;

		if ((effect.f & ROOT_EFFECT) !== 0) {
			// this is now an independent root
			effect.parent = null;
		} else {
			destroy_effect(effect, remove_dom);
		}

		effect = next;
	}
}

/**
 * @param {Effect} signal
 * @returns {void}
 */
function destroy_block_effect_children(signal) {
	var effect = signal.first;

	while (effect !== null) {
		var next = effect.next;
		if ((effect.f & BRANCH_EFFECT) === 0) {
			destroy_effect(effect);
		}
		effect = next;
	}
}

/**
 * @param {Effect} effect
 * @param {boolean} [remove_dom]
 * @returns {void}
 */
function destroy_effect(effect, remove_dom = true) {
	var removed = false;

	if (
		(remove_dom || (effect.f & HEAD_EFFECT) !== 0) &&
		effect.nodes !== null &&
		effect.nodes.end !== null
	) {
		remove_effect_dom(effect.nodes.start, /** @type {TemplateNode} */ (effect.nodes.end));
		removed = true;
	}

	effect.f |= DESTROYING;
	destroy_effect_children(effect, remove_dom && !removed);
	remove_reactions(effect, 0);

	var transitions = effect.nodes && effect.nodes.t;

	if (transitions !== null) {
		for (const transition of transitions) {
			transition.stop();
		}
	}

	execute_effect_teardown(effect);

	effect.f ^= DESTROYING;
	effect.f |= DESTROYED;

	var parent = effect.parent;

	// If the parent doesn't have any children, then skip this work altogether
	if (parent !== null && parent.first !== null) {
		unlink_effect(effect);
	}

	if (DEV) {
		effect.component_function = null;
	}

	// `first` and `child` are nulled out in destroy_effect_children
	// we don't null out `parent` so that error propagation can work correctly
	effect.next =
		effect.prev =
		effect.teardown =
		effect.ctx =
		effect.deps =
		effect.fn =
		effect.nodes =
		effect.ac =
		effect.b =
			null;
}

/**
 *
 * @param {TemplateNode | null} node
 * @param {TemplateNode} end
 */
function remove_effect_dom(node, end) {
	while (node !== null) {
		/** @type {TemplateNode | null} */
		var next = node === end ? null : get_next_sibling(node);

		node.remove();
		node = next;
	}
}

/**
 * Detach an effect from the effect tree, freeing up memory and
 * reducing the amount of work that happens on subsequent traversals
 * @param {Effect} effect
 */
function unlink_effect(effect) {
	var parent = effect.parent;
	var prev = effect.prev;
	var next = effect.next;

	if (prev !== null) prev.next = next;
	if (next !== null) next.prev = prev;

	if (parent !== null) {
		if (parent.first === effect) parent.first = next;
		if (parent.last === effect) parent.last = prev;
	}
}

/**
 * When a block effect is removed, we don't immediately destroy it or yank it
 * out of the DOM, because it might have transitions. Instead, we 'pause' it.
 * It stays around (in memory, and in the DOM) until outro transitions have
 * completed, and if the state change is reversed then we _resume_ it.
 * A paused effect does not update, and the DOM subtree becomes inert.
 * @param {Effect} effect
 * @param {() => void} [callback]
 * @param {boolean} [destroy]
 */
function pause_effect(effect, callback, destroy = true) {
	/** @type {TransitionManager[]} */
	var transitions = [];

	effect.f |= PAUSED;
	pause_children(effect, transitions, true);

	var fn = () => {
		if (destroy) destroy_effect(effect);
		if (callback) callback();
	};

	var remaining = transitions.length;
	if (remaining > 0) {
		var check = () => --remaining || fn();
		for (var transition of transitions) {
			transition.out(check);
		}
	} else {
		fn();
	}
}

/**
 * @param {Effect} effect
 * @param {TransitionManager[]} transitions
 * @param {boolean} local
 */
function pause_children(effect, transitions, local) {
	if ((effect.f & INERT) !== 0) return;
	effect.f ^= INERT;

	var t = effect.nodes && effect.nodes.t;

	if (t !== null) {
		for (const transition of t) {
			if (transition.is_global || local) {
				transitions.push(transition);
			}
		}
	}

	var child = effect.first;

	while (child !== null) {
		var sibling = child.next;

		// If this child is a root effect, then it will become an independent root when its parent
		// is destroyed, it should therefore not become inert nor partake in transitions.
		if ((child.f & ROOT_EFFECT) === 0) {
			var transparent =
				(child.f & EFFECT_TRANSPARENT) !== 0 ||
				// If this is a branch effect without a block effect parent,
				// it means the parent block effect was pruned. In that case,
				// transparency information was transferred to the branch effect.
				((child.f & BRANCH_EFFECT) !== 0 && (effect.f & BLOCK_EFFECT) !== 0);
			// TODO we don't need to call pause_children recursively with a linked list in place
			// it's slightly more involved though as we have to account for `transparent` changing
			// through the tree.
			pause_children(child, transitions, transparent ? local : false);
		}

		child = sibling;
	}
}

/**
 * The opposite of `pause_effect`. We call this if (for example)
 * `x` becomes falsy then truthy: `{#if x}...{/if}`
 * @param {Effect} effect
 */
function resume_effect(effect) {
	effect.f &= ~PAUSED;
	resume_children(effect, true);
}

/**
 * @param {Effect} effect
 * @param {boolean} local
 */
function resume_children(effect, local) {
	// this subtree was paused for its own reasons (e.g. a block whose condition
	// is still false) — its controller will resume or destroy it
	if ((effect.f & PAUSED) !== 0) return;

	if ((effect.f & INERT) === 0) return;
	effect.f ^= INERT;

	// If a dependency of this effect changed while it was paused,
	// schedule the effect to update. we don't use `is_dirty`
	// here because we don't want to eagerly recompute a derived like
	// `{#if foo}{foo.bar()}{/if}` if `foo` is now `undefined
	if ((effect.f & CLEAN) === 0) {
		set_signal_status(effect, DIRTY);
		Batch.ensure().schedule(effect); // Assumption: This happens during the commit phase of the batch, causing another flush, but it's safe
	}

	var child = effect.first;

	while (child !== null) {
		var sibling = child.next;
		var transparent = (child.f & EFFECT_TRANSPARENT) !== 0 || (child.f & BRANCH_EFFECT) !== 0;
		// TODO we don't need to call resume_children recursively with a linked list in place
		// it's slightly more involved though as we have to account for `transparent` changing
		// through the tree.
		resume_children(child, transparent ? local : false);
		child = sibling;
	}

	var t = effect.nodes && effect.nodes.t;

	if (t !== null) {
		for (const transition of t) {
			if (transition.is_global || local) {
				transition.in();
			}
		}
	}
}

/**
 * @param {Effect} effect
 * @param {DocumentFragment} fragment
 */
function move_effect(effect, fragment) {
	if (!effect.nodes) return;

	/** @type {TemplateNode | null} */
	var node = effect.nodes.start;
	var end = effect.nodes.end;

	while (node !== null) {
		/** @type {TemplateNode | null} */
		var next = node === end ? null : get_next_sibling(node);

		fragment.append(node);
		node = next;
	}
}

/** @import { Derived, Effect, Reaction, Source, Value } from '#client' */

let is_destroying_effect = false;

/** @param {boolean} value */
function set_is_destroying_effect(value) {
	is_destroying_effect = value;
}

/** @type {null | Reaction} */
let active_reaction = null;

let untracking = false;

/** @param {null | Reaction} reaction */
function set_active_reaction(reaction) {
	active_reaction = reaction;
}

/** @type {null | Effect} */
let active_effect = null;

/** @param {null | Effect} effect */
function set_active_effect(effect) {
	active_effect = effect;
}

/**
 * When sources are created within a reaction, reading and writing
 * them within that reaction should not cause a re-run
 * @type {null | Set<Value>}
 */
let current_sources = null;

/** @param {Value} value */
function push_reaction_value(value) {
	if (
		active_reaction !== null &&
		(((active_reaction.f & REACTION_IS_UPDATING) !== 0) ||
			(active_reaction.f & DERIVED) !== 0)
	) {
		(current_sources ??= new Set()).add(value);
	}
}

/**
 * The dependencies of the reaction that is currently being executed. In many cases,
 * the dependencies are unchanged between runs, and so this will be `null` unless
 * and until a new dependency is accessed — we track this via `skipped_deps`
 * @type {null | Value[]}
 */
let new_deps = null;

let skipped_deps = 0;

/**
 * Tracks writes that the effect it's executed in doesn't listen to yet,
 * so that the dependency can be added to the effect later on if it then reads it
 * @type {null | Value[]}
 */
let untracked_writes = null;

/** @param {null | Value[]} value */
function set_untracked_writes(value) {
	untracked_writes = value;
}

/**
 * @type {number} Used by sources and deriveds for handling updates.
 * Version starts from 1 so that unowned deriveds differentiate between a created effect and a run one for tracing
 **/
let write_version = 1;

/** @type {number} Used to version each read of a source of derived to avoid duplicating dependencies inside a reaction */
let read_version = 0;

let update_version = read_version;

/** @param {number} value */
function set_update_version(value) {
	update_version = value;
}

function increment_write_version() {
	return ++write_version;
}

/**
 * Determines whether a derived or effect is dirty.
 * If it is MAYBE_DIRTY, will set the status to CLEAN
 * @param {Reaction} reaction
 * @returns {boolean}
 */
function is_dirty(reaction) {
	var flags = reaction.f;

	if ((flags & DIRTY) !== 0) {
		return true;
	}

	if ((flags & MAYBE_DIRTY) !== 0) {
		var dependencies = /** @type {Value[]} */ (reaction.deps);
		var length = dependencies.length;

		for (var i = 0; i < length; i++) {
			var dependency = dependencies[i];

			if (is_dirty(/** @type {Derived} */ (dependency))) {
				update_derived(/** @type {Derived} */ (dependency));
			}

			if (dependency.wv > reaction.wv) {
				return true;
			}
		}

		if (
			(flags & CONNECTED) !== 0 &&
			// During time traveling we don't want to reset the status so that
			// traversal of the graph in the other batches still happens
			batch_values === null
		) {
			set_signal_status(reaction, CLEAN);
		}
	}

	return false;
}

/**
 * @param {Value} signal
 * @param {Effect} effect
 * @param {boolean} [root]
 */
function schedule_possible_effect_self_invalidation(signal, effect, root = true) {
	var reactions = signal.reactions;
	if (reactions === null) return;

	if (current_sources !== null && current_sources.has(signal)) {
		return;
	}

	for (var i = 0; i < reactions.length; i++) {
		var reaction = reactions[i];

		if ((reaction.f & DERIVED) !== 0) {
			schedule_possible_effect_self_invalidation(/** @type {Derived} */ (reaction), effect, false);
		} else if (effect === reaction) {
			if (root) {
				set_signal_status(reaction, DIRTY);
			} else if ((reaction.f & CLEAN) !== 0) {
				set_signal_status(reaction, MAYBE_DIRTY);
			}
			schedule_effect(/** @type {Effect} */ (reaction));
		}
	}
}

/** @param {Reaction} reaction */
function update_reaction(reaction) {
	var previous_deps = new_deps;
	var previous_skipped_deps = skipped_deps;
	var previous_untracked_writes = untracked_writes;
	var previous_reaction = active_reaction;
	var previous_sources = current_sources;
	var previous_component_context = component_context;
	var previous_untracking = untracking;
	var previous_update_version = update_version;

	var flags = reaction.f;

	new_deps = /** @type {null | Value[]} */ (null);
	skipped_deps = 0;
	untracked_writes = null;
	active_reaction = (flags & (BRANCH_EFFECT | ROOT_EFFECT)) === 0 ? reaction : null;

	current_sources = null;
	set_component_context(reaction.ctx);
	untracking = false;
	update_version = ++read_version;

	if (reaction.ac !== null) {
		without_reactive_context(() => {
			/** @type {AbortController} */ (reaction.ac).abort(STALE_REACTION);
		});

		reaction.ac = null;
	}

	try {
		reaction.f |= REACTION_IS_UPDATING;
		var fn = /** @type {Function} */ (reaction.fn);
		var result = fn();
		reaction.f |= REACTION_RAN;
		var deps = update_dependencies(reaction);

		// If we're inside an effect and we have untracked writes, then we need to
		// ensure that if any of those untracked writes result in re-invalidation
		// of the current effect, then that happens accordingly
		if (
			is_runes() &&
			untracked_writes !== null &&
			!untracking &&
			deps !== null &&
			(reaction.f & (DERIVED | MAYBE_DIRTY | DIRTY)) === 0
		) {
			for (var i = 0; i < /** @type {Source[]} */ (untracked_writes).length; i++) {
				schedule_possible_effect_self_invalidation(
					untracked_writes[i],
					/** @type {Effect} */ (reaction)
				);
			}
		}

		// If we are returning to an previous reaction then
		// we need to increment the read version to ensure that
		// any dependencies in this reaction aren't marked with
		// the same version
		if (previous_reaction !== null && previous_reaction !== reaction) {
			read_version++;

			// update the `rv` of the previous reaction's deps — both existing and new —
			// so that they are not added again
			if (previous_reaction.deps !== null) {
				for (let i = 0; i < previous_skipped_deps; i += 1) {
					previous_reaction.deps[i].rv = read_version;
				}
			}

			if (previous_deps !== null) {
				for (const dep of previous_deps) {
					dep.rv = read_version;
				}
			}

			if (untracked_writes !== null) {
				if (previous_untracked_writes === null) {
					previous_untracked_writes = untracked_writes;
				} else {
					previous_untracked_writes.push(.../** @type {Source[]} */ (untracked_writes));
				}
			}
		}

		if ((reaction.f & ERROR_VALUE) !== 0) {
			reaction.f ^= ERROR_VALUE;
		}

		return result;
	} catch (error) {
		// still commit the deps read before the throw, otherwise deriveds connected by this run keep no reader and the reaction never re-runs when they change
		update_dependencies(reaction);

		return handle_error(error);
	} finally {
		reaction.f ^= REACTION_IS_UPDATING;
		new_deps = previous_deps;
		skipped_deps = previous_skipped_deps;
		untracked_writes = previous_untracked_writes;
		active_reaction = previous_reaction;
		current_sources = previous_sources;
		set_component_context(previous_component_context);
		untracking = previous_untracking;
		update_version = previous_update_version;
	}
}

/**
 * @param {Reaction} reaction
 */
function update_dependencies(reaction) {
	var deps = reaction.deps;

	// Don't remove reactions during fork;
	// they must remain for when fork is discarded
	var is_fork = current_batch?.is_fork;

	if (new_deps !== null) {
		var i;

		if (!is_fork) {
			remove_reactions(reaction, skipped_deps);
		}

		if (deps !== null && skipped_deps > 0) {
			deps.length = skipped_deps + new_deps.length;
			for (i = 0; i < new_deps.length; i++) {
				deps[skipped_deps + i] = new_deps[i];
			}
		} else {
			reaction.deps = deps = new_deps;
		}

		if (effect_tracking() && (reaction.f & CONNECTED) !== 0) {
			for (i = skipped_deps; i < deps.length; i++) {
				(deps[i].reactions ??= []).push(reaction);
			}
		}
	} else if (!is_fork && deps !== null && skipped_deps < deps.length) {
		remove_reactions(reaction, skipped_deps);
		deps.length = skipped_deps;
	}

	return deps;
}

/**
 * @template V
 * @param {Reaction} signal
 * @param {Value<V>} dependency
 * @returns {void}
 */
function remove_reaction(signal, dependency) {
	let reactions = dependency.reactions;
	if (reactions !== null) {
		var index = index_of.call(reactions, signal);
		if (index !== -1) {
			var new_length = reactions.length - 1;
			if (new_length === 0) {
				reactions = dependency.reactions = null;
			} else {
				// Swap with last element and then remove.
				reactions[index] = reactions[new_length];
				reactions.pop();
			}
		}
	}

	// If the derived has no reactions, then we can disconnect it from the graph,
	// allowing it to either reconnect in the future, or be GC'd by the VM.
	if (
		reactions === null &&
		(dependency.f & DERIVED) !== 0 &&
		// Destroying a child effect while updating a parent effect can cause a dependency to appear
		// to be unused, when in fact it is used by the currently-updating parent. Checking `new_deps`
		// allows us to skip the expensive work of disconnecting and immediately reconnecting it
		(new_deps === null || !includes.call(new_deps, dependency))
	) {
		var derived = /** @type {Derived} */ (dependency);

		if ((derived.f & CONNECTED) !== 0) {
			derived.f ^= CONNECTED;
		}

		// In a fork it's possible that a derived is executed and gets reactions, then commits, but is
		// never re-executed. This is possible when the derived is only executed once in the context
		// of a new branch which happens before fork.commit() runs. In this case, the derived still has
		// UNINITIALIZED as its value, and then when it's losing its reactions we need to ensure it stays
		// DIRTY so it is reexecuted once someone wants its value again.
		if (derived.v !== UNINITIALIZED) {
			update_derived_status(derived);
		}

		// Call abort controller, noone's listening to this derived anymore
		if (derived.ac !== null) {
			without_reactive_context(() => {
				/** @type {AbortController} */ (derived.ac).abort(STALE_REACTION);
				derived.ac = null;
				// ensure it reruns right away next time instead of potentially returning a rejected promise as its value
				set_signal_status(derived, DIRTY);
			});
		}

		// freeze any effects inside this derived
		freeze_derived_effects(derived);

		// Disconnect any reactions owned by this reaction
		remove_reactions(derived, 0);
	}
}

/**
 * @param {Reaction} signal
 * @param {number} start_index
 * @returns {void}
 */
function remove_reactions(signal, start_index) {
	var dependencies = signal.deps;
	if (dependencies === null) return;

	for (var i = start_index; i < dependencies.length; i++) {
		remove_reaction(signal, dependencies[i]);
	}
}

/**
 * @param {Effect} effect
 * @returns {void}
 */
function update_effect(effect) {
	var flags = effect.f;

	if ((flags & DESTROYED) !== 0) {
		return;
	}

	set_signal_status(effect, CLEAN);

	var previous_effect = active_effect;

	active_effect = effect;

	if (DEV) {
		var previous_component_fn = dev_current_component_function;
		set_dev_current_component_function(effect.component_function);
		var previous_stack = /** @type {any} */ (dev_stack);
		// only block effects have a dev stack, keep the current one otherwise
		set_dev_stack(effect.dev_stack ?? dev_stack);
	}

	try {
		if ((flags & (BLOCK_EFFECT | MANAGED_EFFECT)) !== 0) {
			destroy_block_effect_children(effect);
		} else {
			destroy_effect_children(effect);
		}

		execute_effect_teardown(effect);
		var teardown = update_reaction(effect);
		effect.teardown = typeof teardown === 'function' ? teardown : null;
		effect.wv = write_version;

		// In DEV, increment versions of any sources that were written to during the effect,
		// so that they are correctly marked as dirty when the effect re-runs
		var dep; if (DEV && tracing_mode_flag && (effect.f & DIRTY) !== 0 && effect.deps !== null) ;
	} finally {
		active_effect = previous_effect;

		if (DEV) {
			set_dev_current_component_function(previous_component_fn);
			set_dev_stack(previous_stack);
		}
	}
}

/**
 * Returns a promise that resolves once any pending state changes have been applied.
 * @returns {Promise<void>}
 */
async function tick$1() {

	await Promise.resolve();

	// By calling flushSync we guarantee that any pending state changes are applied after one tick.
	// TODO look into whether we can make flushing subsequent updates synchronously in the future.
	flushSync();
}

/**
 * @template V
 * @param {Value<V>} signal
 * @returns {V}
 */
function get(signal) {
	var flags = signal.f;
	var is_derived = (flags & DERIVED) !== 0;

	// Register the dependency on the current reaction signal.
	if (active_reaction !== null && !untracking) {
		// if we're in a derived that is being read inside an _async_ derived,
		// it's possible that the effect was already destroyed. In this case,
		// we don't add the dependency, because that would create a memory leak
		var destroyed = active_effect !== null && (active_effect.f & DESTROYED) !== 0;

		if (!destroyed && (current_sources === null || !current_sources.has(signal))) {
			var deps = active_reaction.deps;

			if ((active_reaction.f & REACTION_IS_UPDATING) !== 0) {
				// we're in the effect init/update cycle
				if (signal.rv < read_version) {
					signal.rv = read_version;

					// If the signal is accessing the same dependencies in the same
					// order as it did last time, increment `skipped_deps`
					// rather than updating `new_deps`, which creates GC cost
					if (new_deps === null && deps !== null && deps[skipped_deps] === signal) {
						skipped_deps++;
					} else if (new_deps === null) {
						new_deps = [signal];
					} else {
						new_deps.push(signal);
					}
				}
			} else {
				// We're adding a dependency outside the init/update cycle (i.e. after an `await`).
				// We have to deduplicate deps/reactions in this case or remove_reactions could
				// disconnect deps/reactions that are actually still in use (if skip_deps says
				// "disconnect all after this index" and some of the signals are also present in
				// list prior to the cutoff index, i.e. that should be kept).
				active_reaction.deps ??= [];
				if (!includes.call(active_reaction.deps, signal)) {
					active_reaction.deps.push(signal);
				}

				var reactions = signal.reactions;

				if (reactions === null) {
					signal.reactions = [active_reaction];
				} else if (!includes.call(reactions, active_reaction)) {
					reactions.push(active_reaction);
				}
			}
		}
	}

	if (DEV) {
		if (
			!untracking &&
			reactivity_loss_tracker &&
			// By checking that current/previous batch are null we filter out false positives.
			// reactivity_loss_tracker is only reset after a microtask, so if a flush happens
			// before that, we get warnings for things we shouldn't warn on.
			current_batch === null &&
			previous_batch === null &&
			!reactivity_loss_tracker.warned &&
			(reactivity_loss_tracker.effect.f & REACTION_IS_UPDATING) === 0 &&
			!reactivity_loss_tracker.effect_deps.has(signal)
		) {
			reactivity_loss_tracker.warned = true;

			await_reactivity_loss(/** @type {string} */ (signal.label));

			var trace = get_error('traced at');
			// eslint-disable-next-line no-console
			if (trace) console.warn(trace);
		}

		recent_async_deriveds.delete(signal);
	}

	if (is_destroying_effect && old_values.has(signal)) {
		return old_values.get(signal);
	}

	if (is_derived) {
		var derived = /** @type {Derived} */ (signal);

		if (is_destroying_effect) {
			var value = derived.v;

			// if the derived is dirty and has reactions, or depends on the values that just changed, re-execute
			// (a derived can be maybe_dirty due to the effect destroy removing its last reaction)
			if (
				((derived.f & CLEAN) === 0 && derived.reactions !== null) ||
				depends_on_old_values(derived)
			) {
				value = execute_derived(derived);
			}

			old_values.set(derived, value);

			return value;
		}

		// connect disconnected deriveds when reading them inside a connected reaction
		var should_connect =
			(derived.f & CONNECTED) === 0 &&
			!untracking &&
			active_reaction !== null &&
			(active_reaction.f & CONNECTED) !== 0;

		var is_new = (derived.f & REACTION_RAN) === 0;

		if (is_dirty(derived)) {
			if (should_connect) {
				// set the flag before `update_derived`, so that the derived
				// is added as a reaction to its dependencies
				derived.f |= CONNECTED;
			}

			update_derived(derived);
		}

		if (should_connect && !is_new) {
			unfreeze_derived_effects(derived);
			reconnect(derived);
		}
	}

	if (batch_values?.has(signal)) {
		return batch_values.get(signal);
	}

	if ((signal.f & ERROR_VALUE) !== 0) {
		throw signal.v;
	}

	return signal.v;
}

/**
 * (Re)connect a disconnected derived, so that it is notified
 * of changes in `mark_reactions`
 * @param {Derived} derived
 */
function reconnect(derived) {
	derived.f |= CONNECTED;

	if (derived.deps === null) return;

	for (const dep of derived.deps) {
		var reactions = dep.reactions;

		if (reactions === null) {
			dep.reactions = [derived];
		} else if (!includes.call(reactions, derived)) {
			reactions.push(derived);
		}

		if ((dep.f & DERIVED) !== 0 && (dep.f & CONNECTED) === 0) {
			unfreeze_derived_effects(/** @type {Derived} */ (dep));
			reconnect(/** @type {Derived} */ (dep));
		}
	}
}

/** @param {Derived} derived */
function depends_on_old_values(derived) {
	if (derived.v === UNINITIALIZED) return true; // we don't know, so assume the worst
	if (derived.deps === null) return false;

	for (const dep of derived.deps) {
		if (old_values.has(dep)) {
			return true;
		}

		if ((dep.f & DERIVED) !== 0 && depends_on_old_values(/** @type {Derived} */ (dep))) {
			return true;
		}
	}

	return false;
}

/**
 * When used inside a [`$derived`](https://svelte.dev/docs/svelte/$derived) or [`$effect`](https://svelte.dev/docs/svelte/$effect),
 * any state read inside `fn` will not be treated as a dependency.
 *
 * ```ts
 * $effect(() => {
 *   // this will run when `data` changes, but not when `time` changes
 *   save(data, {
 *     timestamp: untrack(() => time)
 *   });
 * });
 * ```
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function untrack(fn) {
	var previous_untracking = untracking;
	try {
		untracking = true;
		return fn();
	} finally {
		untracking = previous_untracking;
	}
}

/**
 * Possibly traverse an object and read all its properties so that they're all reactive in case this is `$state`.
 * Does only check first level of an object for performance reasons (heuristic should be good for 99% of all cases).
 * @param {any} value
 * @returns {void}
 */
function deep_read_state(value) {
	if (typeof value !== 'object' || !value || value instanceof EventTarget) {
		return;
	}

	if (STATE_SYMBOL in value) {
		deep_read(value);
	} else if (!Array.isArray(value)) {
		for (let key in value) {
			const prop = value[key];
			if (typeof prop === 'object' && prop && STATE_SYMBOL in prop) {
				deep_read(prop);
			}
		}
	}
}

/**
 * Deeply traverse an object and read all its properties
 * so that they're all reactive in case this is `$state`
 * @param {any} value
 * @param {Set<any>} visited
 * @returns {void}
 */
function deep_read(value, visited = new Set()) {
	if (
		typeof value === 'object' &&
		value !== null &&
		// We don't want to traverse DOM elements
		!(value instanceof EventTarget) &&
		!visited.has(value)
	) {
		visited.add(value);
		// When working with a possible SvelteDate, this
		// will ensure we capture changes to it.
		if (value instanceof Date) {
			value.getTime();
		}
		for (let key in value) {
			try {
				deep_read(value[key], visited);
			} catch (e) {
				// continue
			}
		}
		const proto = get_prototype_of(value);
		if (
			proto !== Object.prototype &&
			proto !== Array.prototype &&
			proto !== Map.prototype &&
			proto !== Set.prototype &&
			proto !== Date.prototype
		) {
			const descriptors = get_descriptors(proto);
			for (let key in descriptors) {
				const get = descriptors[key].get;
				if (get) {
					try {
						get.call(value);
					} catch (e) {
						// continue
					}
				}
			}
		}
	}
}

/**
 * Subset of delegated events which should be passive by default.
 * These two are already passive via browser defaults on window, document and body.
 * But since
 * - we're delegating them
 * - they happen often
 * - they apply to mobile which is generally less performant
 * we're marking them as passive by default for other elements, too.
 */
const PASSIVE_EVENTS = ['touchstart', 'touchmove'];

/**
 * Returns `true` if `name` is a passive event
 * @param {string} name
 */
function is_passive_event(name) {
	return PASSIVE_EVENTS.includes(name);
}

/**
 * Used on elements, as a map of event type -> event handler,
 * and on events themselves to track which element handled an event
 */
const event_symbol = Symbol('events');

/** @type {Set<string>} */
const all_registered_events = new Set();

/** @type {Set<(events: Array<string>) => void>} */
const root_event_handles = new Set();

/**
 * @param {string} event_name
 * @param {EventTarget} dom
 * @param {EventListener} [handler]
 * @param {AddEventListenerOptions} [options]
 */
function create_event(event_name, dom, handler, options = {}) {
	/**
	 * @this {EventTarget}
	 */
	function target_handler(/** @type {Event} */ event) {
		if (!options.capture) {
			// Only call in the bubble phase, else delegated events would be called before the capturing events
			handle_event_propagation.call(dom, event);
		}
		if (!event.cancelBubble) {
			return without_reactive_context(() => {
				return handler?.call(this, event);
			});
		}
	}

	// Chrome has a bug where pointer events don't work when attached to a DOM element that has been cloned
	// with cloneNode() and the DOM element is disconnected from the document. To ensure the event works, we
	// defer the attachment till after it's been appended to the document. TODO: remove this once Chrome fixes
	// this bug. The same applies to wheel events and touch events.
	if (
		event_name.startsWith('pointer') ||
		event_name.startsWith('touch') ||
		event_name === 'wheel'
	) {
		target_handler.__removed = false;
		queue_micro_task(() => {
			if (!target_handler.__removed) {
				dom.addEventListener(event_name, target_handler, options);
			}
		});
	} else {
		dom.addEventListener(event_name, target_handler, options);
	}

	return target_handler;
}

/**
 * @param {string} event_name
 * @param {Element} dom
 * @param {EventListener} [handler]
 * @param {boolean} [capture]
 * @param {boolean} [passive]
 * @returns {void}
 */
function event(event_name, dom, handler, capture, passive) {
	var options = { capture, passive };
	var target_handler = create_event(event_name, dom, handler, options);

	if (
		dom === document.body ||
		// @ts-ignore
		dom === window ||
		// @ts-ignore
		dom === document ||
		// Firefox has quirky behavior, it can happen that we still get "canplay" events when the element is already removed
		dom instanceof HTMLMediaElement
	) {
		teardown(() => {
			target_handler.__removed = true;
			dom.removeEventListener(event_name, target_handler, options);
		});
	}
}

/**
 * @param {string} event_name
 * @param {Element} element
 * @param {EventListener} [handler]
 * @returns {void}
 */
function delegated(event_name, element, handler) {
	// @ts-expect-error
	(element[event_symbol] ??= {})[event_name] = handler;
}

/**
 * @param {Array<string>} events
 * @returns {void}
 */
function delegate(events) {
	for (var i = 0; i < events.length; i++) {
		all_registered_events.add(events[i]);
	}

	for (var fn of root_event_handles) {
		fn(events);
	}
}

// used to store the reference to the currently propagated event
// to prevent garbage collection between microtasks in Firefox (<= 141)
// If the event object is GCed too early, the expando __root property
// set on the event object is lost, causing the event delegation
// to process the event twice
let last_propagated_event = null;

// whether a task is already queued to clear `last_propagated_event`
let last_propagated_event_clear_scheduled = false;

/**
 * @this {EventTarget}
 * @param {Event} event
 * @returns {void}
 */
function handle_event_propagation(event) {
	var handler_element = this;
	var owner_document = /** @type {Node} */ (handler_element).ownerDocument;
	var event_name = event.type;
	var path = event.composedPath?.() || [];
	var current_target = /** @type {null | Element} */ (path[0] || event.target);

	last_propagated_event = event;

	// The reference is only needed while the event can still reach another
	// delegated root, i.e. during the current (synchronous) dispatch and its
	// microtask checkpoints. Clearing it in a later task preserves the
	// Firefox workaround while making sure the slot doesn't retain the last
	// event forever — through `event.target` it would otherwise keep the
	// entire detached subtree of whatever the user last clicked in alive
	// until the next delegated event happens to arrive.
	if (!last_propagated_event_clear_scheduled) {
		last_propagated_event_clear_scheduled = true;
		setTimeout(() => {
			last_propagated_event_clear_scheduled = false;
			last_propagated_event = null;
		});
	}

	// composedPath contains list of nodes the event has propagated through.
	// We check `event_symbol` to skip all nodes below it in case this is a
	// parent of the `event_symbol` node, which indicates that there's nested
	// mounted apps. In this case we don't want to trigger events multiple times.
	var path_idx = 0;

	// the `last_propagated_event === event` check is redundant, but
	// without it the variable will be DCE'd and things will
	// fail mysteriously in Firefox
	// @ts-expect-error is added below
	var handled_at = last_propagated_event === event && event[event_symbol];

	if (handled_at) {
		var at_idx = path.indexOf(handled_at);
		if (
			at_idx !== -1 &&
			(handler_element === document || handler_element === /** @type {any} */ (window))
		) {
			// This is the fallback document listener or a window listener, but the event was already handled
			// -> ignore, but set handle_at to document/window so that we're resetting the event
			// chain in case someone manually dispatches the same event object again.
			// @ts-expect-error
			event[event_symbol] = handler_element;
			return;
		}

		// We're deliberately not skipping if the index is higher, because
		// someone could create an event programmatically and emit it multiple times,
		// in which case we want to handle the whole propagation chain properly each time.
		// (this will only be a false negative if the event is dispatched multiple times and
		// the fallback document listener isn't reached in between, but that's super rare)
		var handler_idx = path.indexOf(handler_element);
		if (handler_idx === -1) {
			// handle_idx can theoretically be -1 (happened in some JSDOM testing scenarios with an event listener on the window object)
			// so guard against that, too, and assume that everything was handled at this point.
			return;
		}

		if (at_idx <= handler_idx) {
			path_idx = at_idx;
		}
	}

	current_target = /** @type {Element} */ (path[path_idx] || event.target);
	// there can only be one delegated event per element, and we either already handled the current target,
	// or this is the very first target in the chain which has a non-delegated listener, in which case it's safe
	// to handle a possible delegated event on it later (through the root delegation listener for example).
	if (current_target === handler_element) return;

	// Proxy currentTarget to correct target
	define_property(event, 'currentTarget', {
		configurable: true,
		get() {
			return current_target || owner_document;
		}
	});

	// This started because of Chromium issue https://chromestatus.com/feature/5128696823545856,
	// where removal or moving of the DOM can cause sync `blur` events to fire, which can cause logic
	// to run inside the current `active_reaction`, which isn't what we want at all. However, on reflection,
	// it's probably best that all events handled by Svelte have this behaviour, as we don't really want
	// an event handler to run in the context of another reaction or effect.
	var previous_reaction = active_reaction;
	var previous_effect = active_effect;
	set_active_reaction(null);
	set_active_effect(null);

	try {
		/**
		 * @type {unknown}
		 */
		var throw_error;
		/**
		 * @type {unknown[]}
		 */
		var other_errors = [];

		while (current_target !== null) {
			if (current_target === handler_element) break;

			try {
				// @ts-expect-error
				var delegated = current_target[event_symbol]?.[event_name];

				if (
					delegated != null &&
					(!(/** @type {any} */ (current_target).disabled) ||
						// DOM could've been updated already by the time this is reached, so we check this as well
						// -> the target could not have been disabled because it emits the event in the first place
						event.target === current_target)
				) {
					delegated.call(current_target, event);
				}
			} catch (error) {
				if (throw_error) {
					other_errors.push(error);
				} else {
					throw_error = error;
				}
			}
			if (event.cancelBubble) break;

			path_idx++;
			current_target = path_idx < path.length ? /** @type {Element} */ (path[path_idx]) : null;
		}

		if (throw_error) {
			for (let error of other_errors) {
				// Throw the rest of the errors, one-by-one on a microtask
				queueMicrotask(() => {
					throw error;
				});
			}
			throw throw_error;
		}
	} finally {
		// @ts-expect-error is used above
		event[event_symbol] = handler_element;
		// @ts-ignore remove proxy on currentTarget
		delete event.currentTarget;
		set_active_reaction(previous_reaction);
		set_active_effect(previous_effect);
	}
}

const policy =
	// We gotta write it like this because after downleveling the pure comment may end up in the wrong location
	globalThis?.window?.trustedTypes &&
	/* @__PURE__ */ globalThis.window.trustedTypes.createPolicy('svelte-trusted-html', {
		/** @param {string} html */
		createHTML: (html) => {
			return html;
		}
	});

/** @param {string} html */
function create_trusted_html(html) {
	return /** @type {string} */ (policy?.createHTML(html) ?? html);
}

/**
 * @param {string} html
 */
function create_fragment_from_html(html) {
	var elem = create_element('template');
	elem.innerHTML = create_trusted_html(html.replaceAll('<!>', '<!---->')); // XHTML compliance
	return elem.content;
}

/** @import { Effect, EffectNodes, TemplateNode } from '#client' */
/** @import { TemplateStructure } from './types' */

/**
 * @param {TemplateNode} start
 * @param {TemplateNode | null} end
 */
function assign_nodes(start, end) {
	var effect = /** @type {Effect} */ (active_effect);
	if (effect.nodes === null) {
		effect.nodes = { start, end, a: null, t: null };
	}
}

/**
 * @param {string} content
 * @param {number} flags
 * @returns {() => Node | Node[]}
 */
/*#__NO_SIDE_EFFECTS__*/
function from_html(content, flags) {
	var is_fragment = (flags & TEMPLATE_FRAGMENT) !== 0;
	var use_import_node = (flags & TEMPLATE_USE_IMPORT_NODE) !== 0;

	/** @type {Node} */
	var node;

	/**
	 * Whether or not the first item is a text/element node. If not, we need to
	 * create an additional comment node to act as `effect.nodes.start`
	 */
	var has_start = !content.startsWith('<!>');

	return () => {

		if (node === undefined) {
			node = create_fragment_from_html(has_start ? content : '<!>' + content);
			if (!is_fragment) node = /** @type {TemplateNode} */ (get_first_child(node));
		}

		var clone = /** @type {TemplateNode} */ (
			use_import_node || is_firefox ? document.importNode(node, true) : node.cloneNode(true)
		);

		if (is_fragment) {
			var start = /** @type {TemplateNode} */ (get_first_child(clone));
			var end = /** @type {TemplateNode} */ (clone.lastChild);

			assign_nodes(start, end);
		} else {
			assign_nodes(clone, clone);
		}

		return clone;
	};
}

/**
 * Don't mark this as side-effect-free, hydration needs to walk all nodes
 * @param {any} value
 */
function text(value = '') {
	{
		var t = create_text(value + '');
		assign_nodes(t, t);
		return t;
	}
}

/**
 * Assign the created (or in hydration mode, traversed) dom elements to the current block
 * and insert the elements into the dom (in client mode).
 * @param {Text | Comment | Element} anchor
 * @param {DocumentFragment | Element} dom
 */
function append(anchor, dom) {

	if (anchor === null) {
		// edge case — void `<svelte:element>` with content
		return;
	}

	anchor.before(/** @type {Node} */ (dom));
}

/**
 * Returns a `subscribe` function that integrates external event-based systems with Svelte's reactivity.
 * It's particularly useful for integrating with web APIs like `MediaQuery`, `IntersectionObserver`, or `WebSocket`.
 *
 * If `subscribe` is called inside an effect (including indirectly, for example inside a getter),
 * the `start` callback will be called with an `update` function. Whenever `update` is called, the effect re-runs.
 *
 * If `start` returns a cleanup function, it will be called when the effect is destroyed.
 *
 * If `subscribe` is called in multiple effects, `start` will only be called once as long as the effects
 * are active, and the returned teardown function will only be called when all effects are destroyed.
 *
 * It's best understood with an example. Here's an implementation of [`MediaQuery`](https://svelte.dev/docs/svelte/svelte-reactivity#MediaQuery):
 *
 * ```js
 * import { createSubscriber } from 'svelte/reactivity';
 * import { on } from 'svelte/events';
 *
 * export class MediaQuery {
 * 	#query;
 * 	#subscribe;
 *
 * 	constructor(query) {
 * 		this.#query = window.matchMedia(`(${query})`);
 *
 * 		this.#subscribe = createSubscriber((update) => {
 * 			// when the `change` event occurs, re-run any effects that read `this.current`
 * 			const off = on(this.#query, 'change', update);
 *
 * 			// stop listening when all the effects are destroyed
 * 			return () => off();
 * 		});
 * 	}
 *
 * 	get current() {
 * 		// This makes the getter reactive, if read in an effect
 * 		this.#subscribe();
 *
 * 		// Return the current state of the query, whether or not we're in an effect
 * 		return this.#query.matches;
 * 	}
 * }
 * ```
 * @param {(update: () => void) => (() => void) | void} start
 * @since 5.7.0
 */
function createSubscriber(start) {
	let subscribers = 0;
	let version = source(0);
	/** @type {(() => void) | void} */
	let stop;

	if (DEV) {
		tag(version, 'createSubscriber version');
	}

	return () => {
		if (effect_tracking()) {
			get(version);

			render_effect(() => {
				if (subscribers === 0) {
					stop = untrack(() => start(() => increment(version)));
				}

				subscribers += 1;

				return () => {
					queue_micro_task(() => {
						// Only count down after a microtask, else we would reach 0 before our own render effect reruns,
						// but reach 1 again when the tick callback of the prior teardown runs. That would mean we
						// re-subcribe unnecessarily and create a memory leak because the old subscription is never cleaned up.
						subscribers -= 1;

						if (subscribers === 0) {
							stop?.();
							stop = undefined;
							// Increment the version to ensure any dependent deriveds are marked dirty when the subscription is picked up again later.
							// If we didn't do this then the comparison of write versions would determine that the derived has a later version than
							// the subscriber, and it would not be re-run.
							increment(version);
						}
					});
				};
			});
		}
	};
}

/** @import { Effect, Source, TemplateNode, } from '#client' */

/**
 * @typedef {{
 * 	 onerror?: ((error: unknown, reset: () => void) => void) | null;
 *   failed?: ((anchor: Node, error: () => unknown, reset: () => () => void) => void) | null;
 *   pending?: ((anchor: Node) => void) | null;
 * }} BoundaryProps
 */

var flags = EFFECT_TRANSPARENT | EFFECT_PRESERVED;

/**
 * @param {TemplateNode} node
 * @param {BoundaryProps} props
 * @param {((anchor: Node) => void)} children
 * @param {((error: unknown) => unknown) | undefined} [transform_error]
 * @returns {void}
 */
function boundary(node, props, children, transform_error) {
	new Boundary(node, props, children, transform_error);
}

class Boundary {
	/** @type {Boundary | null} */
	parent;

	is_pending = false;

	/**
	 * API-level transformError transform function. Transforms errors before they reach the `failed` snippet.
	 * Inherited from parent boundary, or defaults to identity.
	 * @type {(error: unknown) => unknown}
	 */
	transform_error;

	/** @type {TemplateNode} */
	#anchor;

	/** @type {TemplateNode | null} */
	#hydrate_open = null;

	/** @type {BoundaryProps} */
	#props;

	/** @type {((anchor: Node) => void)} */
	#children;

	/** @type {Effect} */
	#effect;

	/** @type {Effect | null} */
	#main_effect = null;

	/** @type {Effect | null} */
	#pending_effect = null;

	/** @type {Effect | null} */
	#failed_effect = null;

	/** @type {DocumentFragment | null} */
	#offscreen_fragment = null;

	#local_pending_count = 0;
	#pending_count = 0;
	#pending_count_update_queued = false;

	/** @type {Set<Effect>} */
	#dirty_effects = new Set();

	/** @type {Set<Effect>} */
	#maybe_dirty_effects = new Set();

	/**
	 * A source containing the number of pending async deriveds/expressions.
	 * Only created if `$effect.pending()` is used inside the boundary,
	 * otherwise updating the source results in needless `Batch.ensure()`
	 * calls followed by no-op flushes
	 * @type {Source<number> | null}
	 */
	#effect_pending = null;

	#effect_pending_subscriber = createSubscriber(() => {
		this.#effect_pending = source(this.#local_pending_count);

		if (DEV) {
			tag(this.#effect_pending, '$effect.pending()');
		}

		return () => {
			this.#effect_pending = null;
		};
	});

	/**
	 * @param {TemplateNode} node
	 * @param {BoundaryProps} props
	 * @param {((anchor: Node) => void)} children
	 * @param {((error: unknown) => unknown) | undefined} [transform_error]
	 */
	constructor(node, props, children, transform_error) {
		this.#anchor = node;
		this.#props = props;

		this.#children = (anchor) => {
			var effect = /** @type {Effect} */ (active_effect);

			effect.b = this;
			effect.f |= BOUNDARY_EFFECT;

			children(anchor);
		};

		this.parent = /** @type {Effect} */ (active_effect).b;

		// Inherit transform_error from parent boundary, or use the provided one, or default to identity
		this.transform_error = transform_error ?? this.parent?.transform_error ?? ((e) => e);

		this.#effect = block(() => {
			{
				this.#render();
			}
		}, flags);
	}

	#hydrate_resolved_content() {
		try {
			this.#main_effect = branch(() => this.#children(this.#anchor));
		} catch (error) {
			this.error(error);
		}
	}

	/**
	 * @param {unknown} error The deserialized error from the server's hydration comment
	 */
	#hydrate_failed_content(error) {
		const failed = this.#props.failed;
		const { reset, invoke_onerror } = this.#create_reset(error);

		// `onerror` may mutate state, which is disallowed while hydrating
		queue_micro_task(invoke_onerror);

		if (!failed) return;

		this.#failed_effect = branch(() => {
			failed(
				this.#anchor,
				() => error,
				() => reset
			);
		});
	}

	/**
	 * Creates the `reset` function for a failed boundary, along with a function
	 * that invokes `onerror` with it (if provided)
	 * @param {unknown} error
	 * @returns {{ reset: () => void, invoke_onerror: () => void }}
	 */
	#create_reset(error) {
		var did_reset = false;
		var calling_on_error = false;

		const reset = () => {
			if (this.#is_destroyed()) return;

			if (did_reset) {
				svelte_boundary_reset_noop();
				return;
			}

			did_reset = true;

			if (calling_on_error) {
				svelte_boundary_reset_onerror();
			}

			if (this.#failed_effect !== null) {
				pause_effect(this.#failed_effect, () => {
					this.#failed_effect = null;
				});
			}

			this.#run(() => {
				this.#render();
			});
		};

		const invoke_onerror = () => {
			if (this.#is_destroyed()) return;

			try {
				calling_on_error = true;
				this.#props.onerror?.(error, reset);
				calling_on_error = false;
			} catch (err) {
				invoke_error_boundary(err, this.#effect && this.#effect.parent);
			}
		};

		return { reset, invoke_onerror };
	}

	#is_destroyed() {
		return (this.#effect.f & (DESTROYED | DESTROYING)) !== 0;
	}

	#hydrate_pending_content() {
		const pending = this.#props.pending;
		if (!pending) return;

		this.is_pending = true;
		this.#pending_effect = branch(() => pending(this.#anchor));

		queue_micro_task(() => {
			if (this.#is_destroyed()) return;

			var fragment = (this.#offscreen_fragment = document.createDocumentFragment());
			var anchor = create_text();
			var handled = false;

			fragment.append(anchor);

			this.#main_effect = this.#run(() => {
				try {
					return branch(() => this.#children(anchor));
				} catch (error) {
					try {
						this.error(error);
						handled = true;
					} catch (error) {
						invoke_error_boundary(error, this.#effect.parent);
					}

					return null;
				}
			});

			if (this.#main_effect === null) {
				this.#offscreen_fragment = null;
				if (handled) this.#resolve(/** @type {Batch} */ (current_batch));
				return;
			}

			if (this.#pending_count === 0) {
				this.#anchor.before(fragment);
				this.#offscreen_fragment = null;

				pause_effect(/** @type {Effect} */ (this.#pending_effect), () => {
					this.#pending_effect = null;
				});

				this.#resolve(/** @type {Batch} */ (current_batch));
			}
		});
	}

	#render() {
		try {
			this.is_pending = this.has_pending_snippet();
			this.#pending_count = 0;
			this.#local_pending_count = 0;

			this.#main_effect = branch(() => {
				this.#children(this.#anchor);
			});

			if (this.#pending_count > 0) {
				var fragment = (this.#offscreen_fragment = document.createDocumentFragment());
				move_effect(this.#main_effect, fragment);

				const pending = /** @type {(anchor: Node) => void} */ (this.#props.pending);
				this.#pending_effect = branch(() => pending(this.#anchor));
			} else {
				this.#resolve(/** @type {Batch} */ (current_batch));
			}
		} catch (error) {
			this.error(error);
		}
	}

	/**
	 * @param {Batch} batch
	 */
	#resolve(batch) {
		this.is_pending = false;

		// any effects that were previously deferred should be transferred
		// to the batch, which will flush in the next microtask
		batch.transfer_effects(this.#dirty_effects, this.#maybe_dirty_effects);
	}

	/**
	 * Defer an effect inside a pending boundary until the boundary resolves
	 * @param {Effect} effect
	 */
	defer_effect(effect) {
		defer_effect(effect, this.#dirty_effects, this.#maybe_dirty_effects);
	}

	/**
	 * Returns `false` if the effect exists inside a boundary whose pending snippet is shown
	 * @returns {boolean}
	 */
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}

	has_pending_snippet() {
		return !!this.#props.pending;
	}

	/**
	 * @template T
	 * @param {() => T} fn
	 */
	#run(fn) {
		var previous_effect = active_effect;
		var previous_reaction = active_reaction;
		var previous_ctx = component_context;

		set_active_effect(this.#effect);
		set_active_reaction(this.#effect);
		set_component_context(this.#effect.ctx);

		try {
			Batch.ensure();
			return fn();
		} finally {
			set_active_effect(previous_effect);
			set_active_reaction(previous_reaction);
			set_component_context(previous_ctx);
		}
	}

	/**
	 * Updates the pending count associated with the currently visible pending snippet,
	 * if any, such that we can replace the snippet with content once work is done
	 * @param {1 | -1} d
	 * @param {Batch} batch
	 */
	#update_pending_count(d, batch) {
		if (!this.has_pending_snippet()) {
			if (this.parent) {
				this.parent.#update_pending_count(d, batch);
			}

			// if there's no parent, we're in a scope with no pending snippet
			return;
		}

		this.#pending_count += d;

		if (this.#pending_count === 0) {
			this.#resolve(batch);

			if (this.#pending_effect) {
				pause_effect(this.#pending_effect, () => {
					this.#pending_effect = null;
				});
			}

			if (this.#offscreen_fragment) {
				this.#anchor.before(this.#offscreen_fragment);
				this.#offscreen_fragment = null;
			}
		}
	}

	/**
	 * Update the source that powers `$effect.pending()` inside this boundary,
	 * and controls when the current `pending` snippet (if any) is removed.
	 * Do not call from inside the class
	 * @param {1 | -1} d
	 * @param {Batch} batch
	 */
	update_pending_count(d, batch) {
		this.#update_pending_count(d, batch);

		this.#local_pending_count += d;

		if (!this.#effect_pending || this.#pending_count_update_queued) return;
		this.#pending_count_update_queued = true;

		queue_micro_task(() => {
			this.#pending_count_update_queued = false;
			if (this.#effect_pending) {
				internal_set(this.#effect_pending, this.#local_pending_count);
			}
		});
	}

	get_effect_pending() {
		this.#effect_pending_subscriber();
		return get(/** @type {Source<number>} */ (this.#effect_pending));
	}

	/** @param {unknown} error */
	error(error) {
		if (error === HYDRATION_ERROR) {
			throw error;
		}

		// If we have nothing to capture the error, or if we hit an error while
		// rendering the fallback, re-throw for another boundary to handle
		if (!this.#props.onerror && !this.#props.failed) {
			throw error;
		}

		if (current_batch?.is_fork) {
			if (this.#main_effect) current_batch.skip_effect(this.#main_effect);
			if (this.#pending_effect) current_batch.skip_effect(this.#pending_effect);
			if (this.#failed_effect) current_batch.skip_effect(this.#failed_effect);

			current_batch.oncommit(() => {
				if (!this.#is_destroyed()) this.#handle_error(error);
			});
		} else {
			this.#handle_error(error);
		}
	}

	/**
	 * @param {unknown} error
	 */
	#handle_error(error) {
		if (this.#main_effect) {
			destroy_effect(this.#main_effect);
			this.#main_effect = null;
		}

		if (this.#pending_effect) {
			destroy_effect(this.#pending_effect);
			this.#pending_effect = null;
		}

		if (this.#failed_effect) {
			destroy_effect(this.#failed_effect);
			this.#failed_effect = null;
		}

		let failed = this.#props.failed;

		/** @param {unknown} transformed_error */
		const handle_error_result = (transformed_error) => {
			if (this.#is_destroyed()) return;

			const { reset, invoke_onerror } = this.#create_reset(transformed_error);

			invoke_onerror();

			if (failed && !this.#is_destroyed()) {
				this.#failed_effect = this.#run(() => {
					try {
						return branch(() => {
							// errors in `failed` snippets cause the boundary to error again
							// TODO Svelte 6: revisit this decision, most likely better to go to parent boundary instead
							var effect = /** @type {Effect} */ (active_effect);

							effect.b = this;
							effect.f |= BOUNDARY_EFFECT;

							failed(
								this.#anchor,
								() => transformed_error,
								() => reset
							);
						});
					} catch (error) {
						invoke_error_boundary(error, /** @type {Effect} */ (this.#effect.parent));
						return null;
					}
				});
			}
		};

		queue_micro_task(() => {
			if (this.#is_destroyed()) return;

			// Run the error through the API-level transformError transform (e.g. SvelteKit's handleError)
			/** @type {unknown} */
			var result;
			try {
				result = this.transform_error(error);
			} catch (e) {
				invoke_error_boundary(e, this.#effect && this.#effect.parent);
				return;
			}

			if (
				result !== null &&
				typeof result === 'object' &&
				typeof (/** @type {any} */ (result).then) === 'function'
			) {
				// transformError returned a Promise — wait for it
				/** @type {any} */ (result).then(
					handle_error_result,
					/** @param {unknown} e */
					(e) => invoke_error_boundary(e, this.#effect && this.#effect.parent)
				);
			} else {
				// Synchronous result — handle immediately
				handle_error_result(result);
			}
		});
	}
}

/** @import { ComponentContext, Effect, EffectNodes, TemplateNode } from '#client' */
/** @import { Component, ComponentType, SvelteComponent, MountOptions } from '../../index.js' */

/**
 * @param {Element} text
 * @param {string} value
 * @returns {void}
 */
function set_text(text, value) {
	// For objects, we apply string coercion (which might make things like $state array references in the template reactive) before diffing
	var str = value == null ? '' : typeof value === 'object' ? `${value}` : value;
	// prettier-ignore
	if (str !== (/** @type {any} */ (text)[TEXT_CACHE] ??= text.nodeValue)) {
		/** @type {any} */ (text)[TEXT_CACHE] = str;
		text.nodeValue = `${str}`;
	}
}

/**
 * Mounts a component to the given target and returns the exports and potentially the props (if compiled with `accessors: true`) of the component.
 * Transitions will play during the initial render unless the `intro` option is set to `false`.
 *
 * @template {Record<string, any>} Props
 * @template {Record<string, any>} Exports
 * @param {ComponentType<SvelteComponent<Props>> | Component<Props, Exports, any>} component
 * @param {MountOptions<Props>} options
 * @returns {Exports}
 */
function mount(component, options) {
	return _mount(component, options);
}

/** @type {Map<EventTarget, Map<string, number>>} */
const listeners = new Map();

/**
 * @template {Record<string, any>} Exports
 * @param {ComponentType<SvelteComponent<any>> | Component<any>} Component
 * @param {MountOptions} options
 * @returns {Exports}
 */
function _mount(
	Component,
	{ target, anchor, props = {}, events, context, intro = true, transformError }
) {
	init_operations();

	/** @type {Exports} */
	// @ts-expect-error will be defined because the render effect runs synchronously
	var component = undefined;

	var unmount = component_root(() => {
		var anchor_node = anchor ?? target.appendChild(create_text());

		boundary(
			/** @type {TemplateNode} */ (anchor_node),
			{
				pending: () => {}
			},
			(anchor_node) => {
				push({});
				var ctx = /** @type {ComponentContext} */ (component_context);
				if (context) ctx.c = context;

				if (events) {
					// We can't spread the object or else we'd lose the state proxy stuff, if it is one
					/** @type {any} */ (props).$$events = events;
				}
				// @ts-expect-error the public typings are not what the actual function looks like
				component = Component(anchor_node, props) || mark_as_component();

				pop();
			},
			transformError
		);

		// Setup event delegation _after_ component is mounted - if an error would happen during mount, it would otherwise not be cleaned up
		/** @type {Set<string>} */
		var registered_events = new Set();

		/** @param {Array<string>} events */
		var event_handle = (events) => {
			for (var i = 0; i < events.length; i++) {
				var event_name = events[i];

				if (registered_events.has(event_name)) continue;
				registered_events.add(event_name);

				var passive = is_passive_event(event_name);

				// Add the event listener to both the container and the document.
				// The container listener ensures we catch events from within in case
				// the outer content stops propagation of the event.
				//
				// The document listener ensures we catch events that originate from elements that were
				// manually moved outside of the container (e.g. via manual portals).
				for (const node of [target, document]) {
					var counts = listeners.get(node);

					if (counts === undefined) {
						counts = new Map();
						listeners.set(node, counts);
					}

					var count = counts.get(event_name);

					if (count === undefined) {
						node.addEventListener(event_name, handle_event_propagation, { passive });
						counts.set(event_name, 1);
					} else {
						counts.set(event_name, count + 1);
					}
				}
			}
		};

		event_handle(array_from(all_registered_events));
		root_event_handles.add(event_handle);

		return () => {
			for (var event_name of registered_events) {
				for (const node of [target, document]) {
					var counts = /** @type {Map<string, number>} */ (listeners.get(node));
					var count = /** @type {number} */ (counts.get(event_name));

					if (--count == 0) {
						node.removeEventListener(event_name, handle_event_propagation);
						counts.delete(event_name);

						if (counts.size === 0) {
							listeners.delete(node);
						}
					} else {
						counts.set(event_name, count);
					}
				}
			}

			root_event_handles.delete(event_handle);

			if (anchor_node !== anchor) {
				anchor_node.parentNode?.removeChild(anchor_node);
			}
		};
	});

	mounted_components.set(component, unmount);
	return component;
}

/**
 * References of the components that were mounted or hydrated.
 * Uses a `WeakMap` to avoid memory leaks.
 */
let mounted_components = new WeakMap();

/** @import { Effect, TemplateNode } from '#client' */

/**
 * @typedef {{ effect: Effect, fragment: DocumentFragment }} Branch
 */

/**
 * @template Key
 */
class BranchManager {
	/** @type {TemplateNode} */
	anchor;

	/** @type {Map<Batch, Key>} */
	#batches = new Map();

	/**
	 * Map of keys to effects that are currently rendered in the DOM.
	 * These effects are visible and actively part of the document tree.
	 * Example:
	 * ```
	 * {#if condition}
	 * 	foo
	 * {:else}
	 * 	bar
	 * {/if}
	 * ```
	 * Can result in the entries `true->Effect` and `false->Effect`
	 * @type {Map<Key, Effect>}
	 */
	#onscreen = new Map();

	/**
	 * Similar to #onscreen with respect to the keys, but contains branches that are not yet
	 * in the DOM, because their insertion is deferred.
	 * @type {Map<Key, Branch>}
	 */
	#offscreen = new Map();

	/**
	 * Keys of effects that are currently outroing
	 * @type {Set<Key>}
	 */
	#outroing = new Set();

	/**
	 * Whether to pause (i.e. outro) on change, or destroy immediately.
	 * This is necessary for `<svelte:element>`
	 */
	#transition = true;

	/**
	 * @param {TemplateNode} anchor
	 * @param {boolean} transition
	 */
	constructor(anchor, transition = true) {
		this.anchor = anchor;
		this.#transition = transition;
	}

	/**
	 * @param {Batch} batch
	 */
	#commit = (batch) => {
		// if this batch was made obsolete, bail
		if (!this.#batches.has(batch)) return;

		var key = /** @type {Key} */ (this.#batches.get(batch));

		var onscreen = this.#onscreen.get(key);

		if (onscreen) {
			// effect is already in the DOM — abort any current outro
			resume_effect(onscreen);
			this.#outroing.delete(key);
		} else {
			// effect is currently offscreen. put it in the DOM
			var offscreen = this.#offscreen.get(key);

			if (offscreen) {
				// effect could have been outro'ed before through a prior batch — resume if necessary
				resume_effect(offscreen.effect);
				this.#onscreen.set(key, offscreen.effect);
				this.#offscreen.delete(key);

				if (DEV) {
					// Tell hmr.js about the anchor it should use for updates,
					// since the initial one will be removed
					/** @type {any} */ (offscreen.fragment.lastChild)[HMR_ANCHOR] = this.anchor;
				}

				// remove the anchor...
				/** @type {TemplateNode} */ (offscreen.fragment.lastChild).remove();

				// ...and append the fragment
				this.anchor.before(offscreen.fragment);
				onscreen = offscreen.effect;
			}
		}

		for (const [b, k] of this.#batches) {
			this.#batches.delete(b);

			if (b === batch) {
				// keep values for newer batches
				break;
			}

			const offscreen = this.#offscreen.get(k);

			if (offscreen) {
				// for older batches, destroy offscreen effects
				// as they will never be committed
				destroy_effect(offscreen.effect);
				this.#offscreen.delete(k);
			}
		}

		// outro/destroy all onscreen effects...
		for (const [k, effect] of this.#onscreen) {
			// ...except the one that was just committed
			//    or those that are already outroing (else the transition is aborted and the effect destroyed right away)
			if (k === key || this.#outroing.has(k)) continue;

			const on_destroy = () => {
				const keys = Array.from(this.#batches.values());

				if (keys.includes(k)) {
					// keep the effect offscreen, as another batch will need it
					var fragment = document.createDocumentFragment();
					move_effect(effect, fragment);

					fragment.append(create_text()); // TODO can we avoid this?

					this.#offscreen.set(k, { effect, fragment });
				} else {
					destroy_effect(effect);
				}

				this.#outroing.delete(k);
				this.#onscreen.delete(k);
			};

			if (this.#transition || !onscreen) {
				this.#outroing.add(k);
				pause_effect(effect, on_destroy, false);
			} else {
				on_destroy();
			}
		}
	};

	/**
	 * @param {Batch} batch
	 */
	#discard = (batch) => {
		this.#batches.delete(batch);

		const keys = Array.from(this.#batches.values());

		for (const [k, branch] of this.#offscreen) {
			if (!keys.includes(k)) {
				destroy_effect(branch.effect);
				this.#offscreen.delete(k);
			}
		}
	};

	/**
	 *
	 * @param {any} key
	 * @param {null | ((target: TemplateNode) => void)} fn
	 */
	ensure(key, fn) {
		var batch = /** @type {Batch} */ (current_batch);
		var defer = should_defer_append();

		if (fn && !this.#onscreen.has(key) && !this.#offscreen.has(key)) {
			if (defer) {
				var fragment = document.createDocumentFragment();
				var target = create_text();

				fragment.append(target);

				this.#offscreen.set(key, {
					effect: branch(() => fn(target)),
					fragment
				});
			} else {
				this.#onscreen.set(
					key,
					branch(() => fn(this.anchor))
				);
			}
		}

		this.#batches.set(batch, key);

		if (defer) {
			for (const [k, effect] of this.#onscreen) {
				if (k === key) {
					batch.unskip_effect(effect);
				} else {
					batch.skip_effect(effect);
				}
			}

			for (const [k, branch] of this.#offscreen) {
				if (k === key) {
					batch.unskip_effect(branch.effect);
				} else {
					batch.skip_effect(branch.effect);
				}
			}

			batch.oncommit(this.#commit);
			batch.ondiscard(this.#discard);
		} else {

			this.#commit(batch);
		}
	}
}

/** @import { TemplateNode } from '#client' */

/**
 * @param {TemplateNode} node
 * @param {(branch: (fn: (anchor: Node) => void, key?: number | false) => void) => void} fn
 * @param {boolean} [elseif] True if this is an `{:else if ...}` block rather than an `{#if ...}`, as that affects which transitions are considered 'local'
 * @returns {void}
 */
function if_block(node, fn, elseif = false) {

	var branches = new BranchManager(node);
	var flags = elseif ? EFFECT_TRANSPARENT : 0;

	/**
	 * @param {number | false} key
	 * @param {null | ((anchor: Node) => void)} fn
	 */
	function update_branch(key, fn) {

		branches.ensure(key, fn);
	}

	block(() => {
		var has_branch = false;

		fn((fn, key = 0) => {
			has_branch = true;
			update_branch(key, fn);
		});

		if (!has_branch) {
			update_branch(-1, null);
		}
	}, flags);
}

/** @import { EachItem, EachOutroGroup, EachState, Effect, EffectNodes, MaybeSource, TemplateNode, TransitionManager } from '#client' */
/** @import { Batch } from '../../reactivity/batch.js'; */

// When making substantive changes to this file, validate them with the each block stress test:
// https://svelte.dev/playground/1972b2cf46564476ad8c8c6405b23b7b
// This test also exists in this repo, as `packages/svelte/tests/manual/each-stress-test`

/**
 * @param {any} _
 * @param {number} i
 */
function index(_, i) {
	return i;
}

/**
 * Pause multiple effects simultaneously, and coordinate their
 * subsequent destruction. Used in each blocks
 * @param {EachState} state
 * @param {Effect[]} to_destroy
 * @param {null | Node} controlled_anchor
 */
function pause_effects(state, to_destroy, controlled_anchor) {
	/** @type {TransitionManager[]} */
	var transitions = [];
	var length = to_destroy.length;

	/** @type {EachOutroGroup} */
	var group;
	var remaining = to_destroy.length;

	for (var i = 0; i < length; i++) {
		let effect = to_destroy[i];

		pause_effect(
			effect,
			() => {
				if (group) {
					group.pending.delete(effect);
					group.done.add(effect);

					if (group.pending.size === 0) {
						var groups = /** @type {Set<EachOutroGroup>} */ (state.outrogroups);

						destroy_effects(state, array_from(group.done));
						groups.delete(group);

						if (groups.size === 0) {
							state.outrogroups = null;
						}
					}
				} else {
					remaining -= 1;
				}
			},
			false
		);
	}

	if (remaining === 0) {
		// If we're in a controlled each block (i.e. the block is the only child of an
		// element), and we are removing all items, _and_ there are no out transitions,
		// we can use the fast path — emptying the element and replacing the anchor.
		// Skip the fast path when another batch is still pending on this each block:
		// that batch's keys still reference EachItems in `state.items`, which
		// `destroy_effects` needs to preserve offscreen (see #18610).
		var fast_path =
			transitions.length === 0 && controlled_anchor !== null && state.pending.size === 0;

		if (fast_path) {
			var anchor = /** @type {Element} */ (controlled_anchor);
			var parent_node = /** @type {Element} */ (anchor.parentNode);

			clear_text_content(parent_node);
			parent_node.append(anchor);

			state.items.clear();
		}

		destroy_effects(state, to_destroy, !fast_path);
	} else {
		group = {
			pending: new Set(to_destroy),
			done: new Set()
		};

		(state.outrogroups ??= new Set()).add(group);
	}
}

/**
 * @param {EachState} state
 * @param {Effect[]} to_destroy
 * @param {boolean} remove_dom
 */
function destroy_effects(state, to_destroy, remove_dom = true) {
	/** @type {Set<Effect> | undefined} */
	var preserved_effects;

	// The loop-in-a-loop isn't ideal, but we should only hit this in relatively rare cases
	if (state.pending.size > 0) {
		preserved_effects = new Set();

		for (const keys of state.pending.values()) {
			for (const key of keys) {
				preserved_effects.add(/** @type {EachItem} */ (state.items.get(key)).e);
			}
		}
	}

	for (var i = 0; i < to_destroy.length; i++) {
		var e = to_destroy[i];

		if (preserved_effects?.has(e)) {
			e.f |= EFFECT_OFFSCREEN;

			const fragment = document.createDocumentFragment();
			move_effect(e, fragment);
		} else {
			destroy_effect(to_destroy[i], remove_dom);
		}
	}
}

/** @type {TemplateNode} */
var offscreen_anchor;

/**
 * @template V
 * @param {Element | Comment} node The next sibling node, or the parent node if this is a 'controlled' block
 * @param {number} flags
 * @param {() => V[]} get_collection
 * @param {(value: V, index: number) => any} get_key
 * @param {(anchor: Node, item: MaybeSource<V>, index: MaybeSource<number>) => void} render_fn
 * @param {null | ((anchor: Node) => void)} fallback_fn
 * @returns {void}
 */
function each(node, flags, get_collection, get_key, render_fn, fallback_fn = null) {
	var anchor = node;

	/** @type {Map<any, EachItem>} */
	var items = new Map();

	var is_controlled = (flags & EACH_IS_CONTROLLED) !== 0;

	if (is_controlled) {
		var parent_node = /** @type {Element} */ (node);

		anchor = parent_node.appendChild(create_text());
	}

	/** @type {Effect | null} */
	var fallback = null;

	// TODO: ideally we could use derived for runes mode but because of the ability
	// to use a store which can be mutated, we can't do that here as mutating a store
	// will still result in the collection array being the same from the store
	var each_array = derived_safe_equal(() => {
		var collection = get_collection();

		return /** @type {V[]} */ (
			is_array(collection) ? collection : collection == null ? [] : array_from(collection)
		);
	});

	if (DEV) {
		tag(each_array, '{#each ...}');
	}

	/** @type {Map<Batch, Set<any>>} */
	var pending = new Map();

	var first_run = true;

	/**
	 * @param {Batch} batch
	 */
	function commit(batch) {
		if ((state.effect.f & DESTROYED) !== 0) {
			return;
		}

		state.pending.delete(batch);

		// The effect doesn't necessarily re-run in a batch right before that batch commits
		// (its view of the collection may not have changed), so we read the collection
		// as the committing batch sees it rather than using the most recent block run's result
		var array = get(each_array);

		state.fallback = fallback;
		reconcile(state, array, anchor, flags, get_key);

		if (fallback !== null) {
			if (array.length === 0) {
				if ((fallback.f & EFFECT_OFFSCREEN) === 0) {
					resume_effect(fallback);
				} else {
					fallback.f ^= EFFECT_OFFSCREEN;
					move(fallback, null, anchor);
				}
			} else {
				pause_effect(fallback, () => {
					// TODO only null out if no pending batch needs it,
					// otherwise re-add `fallback.fragment` and move the
					// effect into it
					fallback = null;
				});
			}
		}
	}

	/**
	 * @param {Batch} batch
	 */
	function discard(batch) {
		state.pending.delete(batch);
	}

	var effect = block(() => {
		var array = /** @type {V[]} */ (get(each_array));
		var length = array.length;

		var keys = new Set();
		var batch = /** @type {Batch} */ (current_batch);
		var defer = should_defer_append();

		for (var index = 0; index < length; index += 1) {

			var value = array[index];
			var key = get_key(value, index);

			if (DEV) {
				// Check that the key function is idempotent (returns the same value when called twice)
				var key_again = get_key(value, index);
				if (key !== key_again) {
					each_key_volatile(String(index), String(key), String(key_again));
				}
			}

			var item = first_run ? null : items.get(key);

			if (item) {
				// update before reconciliation, to trigger any async updates
				if (item.v) internal_set(item.v, value);
				if (item.i) internal_set(item.i, index);

				if (defer) {
					batch.unskip_effect(item.e);
				}
			} else {
				item = create_item(
					items,
					first_run ? anchor : (offscreen_anchor ??= create_text()),
					value,
					key,
					index,
					render_fn,
					flags,
					get_collection
				);

				if (!first_run) {
					item.e.f |= EFFECT_OFFSCREEN;
				}

				items.set(key, item);
			}

			keys.add(key);
		}

		if (length === 0 && fallback_fn && !fallback) {
			if (first_run) {
				fallback = branch(() => fallback_fn(anchor));
			} else {
				fallback = branch(() => fallback_fn((offscreen_anchor ??= create_text())));
				fallback.f |= EFFECT_OFFSCREEN;
			}
		}

		if (length > keys.size) {
			if (DEV) {
				validate_each_keys(array, get_key);
			} else {
				// in prod, the additional information isn't printed, so don't bother computing it
				each_key_duplicate('', '', '');
			}
		}

		if (!first_run) {
			pending.set(batch, keys);

			if (defer) {
				for (const [key, item] of items) {
					if (!keys.has(key)) {
						batch.skip_effect(item.e);
					}
				}

				batch.oncommit(commit);
				batch.ondiscard(discard);
			} else {
				commit(batch);
			}
		}

		// When we mount the each block for the first time, the collection won't be
		// connected to this effect as the effect hasn't finished running yet and its deps
		// won't be assigned. However, it's possible that when reconciling the each block
		// that a mutation occurred and it's made the collection MAYBE_DIRTY, so reading the
		// collection again can provide consistency to the reactive graph again as the deriveds
		// will now be `CLEAN`.
		get(each_array);
	});

	/** @type {EachState} */
	var state = { effect, items, pending, outrogroups: null, fallback };

	first_run = false;
}

/**
 * Skip past any non-branch effects (which could be created with `createSubscriber`, for example) to find the next branch effect
 * @param {Effect | null} effect
 * @returns {Effect | null}
 */
function skip_to_branch(effect) {
	while (effect !== null && (effect.f & BRANCH_EFFECT) === 0) {
		effect = effect.next;
	}
	return effect;
}

/**
 * Add, remove, or reorder items output by an each block as its input changes
 * @template V
 * @param {EachState} state
 * @param {Array<V>} array
 * @param {Element | Comment | Text} anchor
 * @param {number} flags
 * @param {(value: V, index: number) => any} get_key
 * @returns {void}
 */
function reconcile(state, array, anchor, flags, get_key) {
	var is_animated = (flags & EACH_IS_ANIMATED) !== 0;

	var length = array.length;
	var items = state.items;
	var current = skip_to_branch(state.effect.first);

	/** @type {undefined | Set<Effect>} */
	var seen;

	/** @type {Effect | null} */
	var prev = null;

	/** @type {undefined | Set<Effect>} */
	var to_animate;

	/** @type {Effect[]} */
	var matched = [];

	/** @type {Effect[]} */
	var stashed = [];

	/** @type {V} */
	var value;

	/** @type {any} */
	var key;

	/** @type {Effect | undefined} */
	var effect;

	/** @type {number} */
	var i;

	if (is_animated) {
		for (i = 0; i < length; i += 1) {
			value = array[i];
			key = get_key(value, i);
			effect = /** @type {EachItem} */ (items.get(key)).e;

			// offscreen == coming in now, no animation in that case,
			// else this would happen https://github.com/sveltejs/svelte/issues/17181
			if ((effect.f & EFFECT_OFFSCREEN) === 0) {
				effect.nodes?.a?.measure();
				(to_animate ??= new Set()).add(effect);
			}
		}
	}

	for (i = 0; i < length; i += 1) {
		value = array[i];
		key = get_key(value, i);

		effect = /** @type {EachItem} */ (items.get(key)).e;

		if (state.outrogroups !== null) {
			for (const group of state.outrogroups) {
				group.pending.delete(effect);
				group.done.delete(effect);
			}
		}

		if ((effect.f & INERT) !== 0) {
			resume_effect(effect);
			if (is_animated) {
				effect.nodes?.a?.unfix();
				(to_animate ??= new Set()).delete(effect);
			}
		}

		if ((effect.f & EFFECT_OFFSCREEN) !== 0) {
			effect.f ^= EFFECT_OFFSCREEN;

			if (effect === current) {
				move(effect, null, anchor);
			} else {
				var next = prev ? prev.next : current;

				if (effect === state.effect.last) {
					state.effect.last = effect.prev;
				}

				if (effect.prev) effect.prev.next = effect.next;
				if (effect.next) effect.next.prev = effect.prev;
				link(state, prev, effect);
				link(state, effect, next);

				move(effect, next, anchor);
				prev = effect;

				matched = [];
				stashed = [];

				current = skip_to_branch(prev.next);
				continue;
			}
		}

		if (effect !== current) {
			if (seen !== undefined && seen.has(effect)) {
				if (matched.length < stashed.length) {
					// more efficient to move later items to the front
					var start = stashed[0];
					var j;

					prev = start.prev;

					var a = matched[0];
					var b = matched[matched.length - 1];

					for (j = 0; j < matched.length; j += 1) {
						move(matched[j], start, anchor);
					}

					for (j = 0; j < stashed.length; j += 1) {
						seen.delete(stashed[j]);
					}

					link(state, a.prev, b.next);
					link(state, prev, a);
					link(state, b, start);

					current = start;
					prev = b;
					i -= 1;

					matched = [];
					stashed = [];
				} else {
					// more efficient to move earlier items to the back
					seen.delete(effect);
					move(effect, current, anchor);

					link(state, effect.prev, effect.next);
					link(state, effect, prev === null ? state.effect.first : prev.next);
					link(state, prev, effect);

					prev = effect;
				}

				continue;
			}

			matched = [];
			stashed = [];

			while (current !== null && current !== effect) {
				(seen ??= new Set()).add(current);
				stashed.push(current);
				current = skip_to_branch(current.next);
			}

			if (current === null) {
				continue;
			}
		}

		if ((effect.f & EFFECT_OFFSCREEN) === 0) {
			matched.push(effect);
		}

		prev = effect;
		current = skip_to_branch(effect.next);
	}

	if (state.outrogroups !== null) {
		for (const group of state.outrogroups) {
			if (group.pending.size === 0) {
				destroy_effects(state, array_from(group.done));
				state.outrogroups?.delete(group);
			}
		}

		if (state.outrogroups.size === 0) {
			state.outrogroups = null;
		}
	}

	if (current !== null || seen !== undefined) {
		/** @type {Effect[]} */
		var to_destroy = [];

		if (seen !== undefined) {
			for (effect of seen) {
				if ((effect.f & INERT) === 0) {
					to_destroy.push(effect);
				}
			}
		}

		while (current !== null) {
			// If the each block isn't inert, then inert effects are currently outroing and will be removed once the transition is finished
			if ((current.f & INERT) === 0 && current !== state.fallback) {
				to_destroy.push(current);
			}

			current = skip_to_branch(current.next);
		}

		var destroy_length = to_destroy.length;

		if (destroy_length > 0) {
			var controlled_anchor = (flags & EACH_IS_CONTROLLED) !== 0 && length === 0 ? anchor : null;

			if (is_animated) {
				for (i = 0; i < destroy_length; i += 1) {
					to_destroy[i].nodes?.a?.measure();
				}

				for (i = 0; i < destroy_length; i += 1) {
					to_destroy[i].nodes?.a?.fix();
				}
			}

			pause_effects(state, to_destroy, controlled_anchor);
		}
	}

	if (is_animated) {
		queue_micro_task(() => {
			if (to_animate === undefined) return;
			for (effect of to_animate) {
				effect.nodes?.a?.apply();
			}
		});
	}
}

/**
 * @template V
 * @param {Map<any, EachItem>} items
 * @param {Node} anchor
 * @param {V} value
 * @param {unknown} key
 * @param {number} index
 * @param {(anchor: Node, item: MaybeSource<V>, index: MaybeSource<number>, collection: () => V[]) => void} render_fn
 * @param {number} flags
 * @param {() => V[]} get_collection
 * @returns {EachItem}
 */
function create_item(items, anchor, value, key, index, render_fn, flags, get_collection) {
	var v =
		(flags & EACH_ITEM_REACTIVE) !== 0
			? (flags & EACH_ITEM_IMMUTABLE) === 0
				? mutable_source(value, false, false)
				: source(value)
			: null;

	var i = (flags & EACH_INDEX_REACTIVE) !== 0 ? source(index) : null;

	if (DEV && v) {
		// For tracing purposes, we need to link the source signal we create with the
		// collection + index so that tracing works as intended
		v.trace = () => {
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			get_collection()[i?.v ?? index];
		};
	}

	return {
		v,
		i,
		e: branch(() => {
			render_fn(anchor, v ?? value, i ?? index, get_collection);

			return () => {
				items.delete(key);
			};
		})
	};
}

/**
 * @param {Effect} effect
 * @param {Effect | null} next
 * @param {Text | Element | Comment} anchor
 */
function move(effect, next, anchor) {
	if (!effect.nodes) return;

	var node = effect.nodes.start;
	var end = effect.nodes.end;

	var dest =
		next && (next.f & EFFECT_OFFSCREEN) === 0
			? /** @type {EffectNodes} */ (next.nodes).start
			: anchor;

	while (node !== null) {
		var next_node = /** @type {TemplateNode} */ (get_next_sibling(node));
		dest.before(node);

		if (node === end) {
			return;
		}

		node = next_node;
	}
}

/**
 * @param {EachState} state
 * @param {Effect | null} prev
 * @param {Effect | null} next
 */
function link(state, prev, next) {
	if (prev === null) {
		state.effect.first = next;
	} else {
		prev.next = next;
	}

	if (next === null) {
		state.effect.last = prev;
	} else {
		next.prev = prev;
	}
}

/**
 * @param {Array<any>} array
 * @param {(item: any, index: number) => string} key_fn
 * @returns {void}
 */
function validate_each_keys(array, key_fn) {
	const keys = new Map();
	const length = array.length;

	for (let i = 0; i < length; i++) {
		const key = key_fn(array[i], i);

		if (keys.has(key)) {
			const a = String(keys.get(key));
			const b = String(i);

			/** @type {string | null} */
			let k = String(key);
			if (k.startsWith('[object ')) k = null;

			each_key_duplicate(a, b, k);
		}

		keys.set(key, i);
	}
}

/** @import { Effect, TemplateNode } from '#client' */
/** @import {} from 'trusted-types' */

/**
 * @param {Element | Text | Comment} node
 * @param {() => string | TrustedHTML} get_value
 * @param {boolean} [is_controlled]
 * @param {boolean} [svg]
 * @param {boolean} [mathml]
 * @param {boolean} [skip_warning]
 * @returns {void}
 */
function html(
	node,
	get_value,
	is_controlled = false,
	svg = false,
	mathml = false,
	skip_warning = false
) {
	var anchor = node;

	/** @type {string | TrustedHTML} */
	var value = '';

	if (is_controlled) {
		var parent_node = /** @type {Element} */ (node);
	}

	template_effect(() => {
		var effect = /** @type {Effect} */ (active_effect);

		if (value === (value = get_value() ?? '')) {
			return;
		}

		if (is_controlled && true) {
			// When @html is the only child, use innerHTML directly.
			// This also handles contenteditable, where the user may delete the anchor comment.
			effect.nodes = null;
			parent_node.innerHTML = /** @type {string} */ (value);

			if (value !== '') {
				assign_nodes(
					/** @type {TemplateNode} */ (get_first_child(parent_node)),
					/** @type {TemplateNode} */ (parent_node.lastChild)
				);
			}

			return;
		}

		if (effect.nodes !== null) {
			remove_effect_dom(effect.nodes.start, /** @type {TemplateNode} */ (effect.nodes.end));
			effect.nodes = null;
		}

		if (value === '') return;

		// Don't use create_fragment_with_script_from_html here because that would mean script tags are executed.
		// @html is basically `.innerHTML = ...` and that doesn't execute scripts either due to security reasons.
		// Use a <template>, <svg>, or <math> wrapper depending on context. If value is a TrustedHTML object,
		// it will be assigned directly to innerHTML without coercion — this allows {@html policy.createHTML(...)} to work.
		var ns = svg ? NAMESPACE_SVG : mathml ? NAMESPACE_MATHML : undefined;
		var wrapper = /** @type {HTMLTemplateElement | SVGElement | MathMLElement} */ (
			create_element(svg ? 'svg' : mathml ? 'math' : 'template', ns)
		);
		wrapper.innerHTML = /** @type {any} */ (value);

		/** @type {DocumentFragment | Element} */
		var node = svg || mathml ? wrapper : /** @type {HTMLTemplateElement} */ (wrapper).content;

		assign_nodes(
			/** @type {TemplateNode} */ (get_first_child(node)),
			/** @type {TemplateNode} */ (node.lastChild)
		);

		if (svg || mathml) {
			while (get_first_child(node)) {
				anchor.before(/** @type {TemplateNode} */ (get_first_child(node)));
			}
		} else {
			anchor.before(node);
		}
	});
}

const whitespace = [...' \t\n\r\f\u00a0\u000b\ufeff'];

/**
 * @param {any} value
 * @param {string | null} [hash]
 * @param {Record<string, boolean>} [directives]
 * @returns {string | null}
 */
function to_class(value, hash, directives) {
	var classname = value == null ? '' : '' + value;

	if (directives) {
		for (var key of Object.keys(directives)) {
			if (directives[key]) {
				classname = classname ? classname + ' ' + key : key;
			} else if (classname.length) {
				var len = key.length;
				var a = 0;

				while ((a = classname.indexOf(key, a)) >= 0) {
					var b = a + len;

					if (
						(a === 0 || whitespace.includes(classname[a - 1])) &&
						(b === classname.length || whitespace.includes(classname[b]))
					) {
						classname = (a === 0 ? '' : classname.substring(0, a)) + classname.substring(b + 1);
					} else {
						a = b;
					}
				}
			}
		}
	}

	return classname === '' ? null : classname;
}

/**
 * @param {Element} dom
 * @param {boolean | number} is_html
 * @param {string | null} value
 * @param {string} [hash]
 * @param {Record<string, any>} [prev_classes]
 * @param {Record<string, any>} [next_classes]
 * @returns {Record<string, boolean> | undefined}
 */
function set_class(dom, is_html, value, hash, prev_classes, next_classes) {
	var prev = /** @type {any} */ (dom)[CLASS_CACHE];

	if (
		prev !== value ||
		prev === undefined // for edge case of `class={undefined}`
	) {
		var next_class_name = to_class(value, hash, next_classes);

		{
			// Removing the attribute when the value is only an empty string causes
			// performance issues vs simply making the className an empty string. So
			// we should only remove the class if the value is nullish
			// and there no hash/directives :
			if (next_class_name == null) {
				dom.removeAttribute('class');
			} else {
				dom.className = next_class_name;
			}
		}

		/** @type {any} */ (dom)[CLASS_CACHE] = value;
	} else if (next_classes && prev_classes !== next_classes) {
		for (var key in next_classes) {
			var is_present = !!next_classes[key];

			if (prev_classes == null || is_present !== !!prev_classes[key]) {
				dom.classList.toggle(key, is_present);
			}
		}
	}

	return next_classes;
}

/** @import { Blocker, Effect } from '#client' */

const IS_CUSTOM_ELEMENT = Symbol('is custom element');
const IS_HTML = Symbol('is html');
const PROGRESS_TAG = IS_XHTML ? 'progress' : 'PROGRESS';

/**
 * @param {Element} element
 * @param {any} value
 */
function set_value(element, value) {
	var attributes = get_attributes(element);

	if (
		attributes.value ===
			(attributes.value =
				// treat null and undefined the same for the initial value
				value ?? undefined) ||
		// @ts-expect-error
		// `progress` elements always need their value set when it's `0`
		(element.value === value && (value !== 0 || element.nodeName !== PROGRESS_TAG))
	) {
		return;
	}

	// @ts-expect-error
	element.value = value ?? '';
}

/**
 * @param {Element} element
 * @param {string} attribute
 * @param {string | null} value
 * @param {boolean} [skip_warning]
 */
function set_attribute(element, attribute, value, skip_warning) {
	var attributes = get_attributes(element);

	if (attributes[attribute] === (attributes[attribute] = value)) return;

	if (attribute === 'loading') {
		// @ts-expect-error
		element[LOADING_ATTR_SYMBOL] = value;
	}

	if (value == null) {
		element.removeAttribute(attribute);
	} else if (typeof value !== 'string' && get_setters(element).has(attribute)) {
		// @ts-ignore
		element[attribute] = value;
	} else {
		element.setAttribute(attribute, value);
	}
}

/**
 *
 * @param {Element} element
 */
function get_attributes(element) {
	return /** @type {Record<string | symbol, unknown>} **/ (
		/** @type {any} */ (element)[ATTRIBUTES_CACHE] ??= {
			[IS_CUSTOM_ELEMENT]: element.nodeName.includes('-'),
			[IS_HTML]: element.namespaceURI === NAMESPACE_HTML
		}
	);
}

/** @type {Map<string, Set<string>>} */
var setters_cache = new Map();

/** @param {Element} element */
function get_setters(element) {
	var cache_key = element.getAttribute('is') || element.nodeName;
	var setters = setters_cache.get(cache_key);
	if (setters) return setters;
	setters_cache.set(cache_key, (setters = new Set()));

	var descriptors;
	var proto = element; // In the case of custom elements there might be setters on the instance
	var element_proto = Element.prototype;

	// Stop at Element, from there on there's only unnecessary (and dangerous, like innerHTML) setters we're not interested in
	// Do not use constructor.name here as that's unreliable in some browser environments
	while (element_proto !== proto) {
		descriptors = get_descriptors(proto);

		for (var key in descriptors) {
			if (
				descriptors[key].set &&
				// better safe than sorry, we don't want spread attributes to mess with HTML content
				key !== 'innerHTML' &&
				key !== 'textContent' &&
				key !== 'innerText'
			) {
				setters.add(key);
			}
		}

		proto = get_prototype_of(proto);
	}

	return setters;
}

/** @import { Batch } from '../../../reactivity/batch.js' */

/**
 * @param {HTMLInputElement} input
 * @param {() => unknown} get
 * @param {(value: unknown) => void} set
 * @returns {void}
 */
function bind_value(input, get, set = get) {
	var batches = new WeakSet();

	listen_to_event_and_reset_event(input, 'input', async (is_reset) => {
		if (DEV && input.type === 'checkbox') {
			// TODO should this happen in prod too?
			bind_invalid_checkbox_value();
		}

		/** @type {any} */
		var value = is_reset ? input.defaultValue : input.value;
		value = is_numberlike_input(input) ? to_number(value) : value;
		set(value);

		if (current_batch !== null) {
			batches.add(current_batch);
		}

		// Because `{#each ...}` blocks work by updating sources inside the flush,
		// we need to wait a tick before checking to see if we should forcibly
		// update the input and reset the selection state
		await tick$1();

		// Respect any validation in accessors
		if (value !== (value = get())) {
			var start = input.selectionStart;
			var end = input.selectionEnd;
			var length = input.value.length;

			// the value is coerced on assignment
			input.value = value ?? '';

			// Restore selection
			if (end !== null) {
				var new_length = input.value.length;
				// If cursor was at end and new input is longer, move cursor to new end
				if (start === end && end === length && new_length > length) {
					input.selectionStart = new_length;
					input.selectionEnd = new_length;
				} else {
					input.selectionStart = start;
					input.selectionEnd = Math.min(end, new_length);
				}
			}
		}
	});

	if (
		// If we are hydrating and the value has since changed,
		// then use the updated value from the input instead.
		// If defaultValue is set, then value == defaultValue
		// TODO Svelte 6: remove input.value check and set to empty string?
		(untrack(get) == null && input.value)
	) {
		set(is_numberlike_input(input) ? to_number(input.value) : input.value);

		if (current_batch !== null) {
			batches.add(current_batch);
		}
	}

	render_effect(() => {
		if (DEV && input.type === 'checkbox') {
			// TODO should this happen in prod too?
			bind_invalid_checkbox_value();
		}

		var value = get();

		if (input === document.activeElement) {
			// In sync mode render effects are executed during tree traversal -> needs current_batch
			// In async mode render effects are flushed once batch resolved, at which point current_batch is null -> needs previous_batch
			var batch = /** @type {Batch} */ (current_batch);

			// Never rewrite the contents of a focused input. We can get here if, for example,
			// an update is deferred because of async work depending on the input:
			//
			// <input bind:value={query}>
			// <p>{await find(query)}</p>
			if (batches.has(batch)) {
				return;
			}
		}

		if (is_numberlike_input(input) && value === to_number(input.value)) {
			// handles 0 vs 00 case (see https://github.com/sveltejs/svelte/issues/9959)
			return;
		}

		if (input.type === 'date' && !value && !input.value) {
			// Handles the case where a temporarily invalid date is set (while typing, for example with a leading 0 for the day)
			// and prevents this state from clearing the other parts of the date input (see https://github.com/sveltejs/svelte/issues/7897)
			return;
		}

		// don't set the value of the input if it's the same to allow
		// minlength to work properly
		if (value !== input.value) {
			// @ts-expect-error the value is coerced on assignment
			input.value = value ?? '';
		}
	});
}

/**
 * @param {HTMLInputElement} input
 */
function is_numberlike_input(input) {
	var type = input.type;
	return type === 'number' || type === 'range';
}

/**
 * @param {string} value
 */
function to_number(value) {
	return value === '' ? null : +value;
}

/** @import { ComponentContext, Effect } from '#client' */

/**
 * @param {any} bound_value
 * @param {Element} element_or_component
 * @returns {boolean}
 */
function is_bound_this(bound_value, element_or_component) {
	return (
		bound_value === element_or_component || bound_value?.[STATE_SYMBOL] === element_or_component
	);
}

/**
 * @param {any} element_or_component
 * @param {(value: unknown, ...parts: unknown[]) => void} update
 * @param {(...parts: unknown[]) => unknown} get_value
 * @param {() => unknown[]} [get_parts] Set if the this binding is used inside an each block,
 * 										returns all the parts of the each block context that are used in the expression
 * @returns {void}
 */
function bind_this(
	element_or_component = mark_as_component(),
	update,
	get_value,
	get_parts
) {
	var component_effect = /** @type {ComponentContext} */ (component_context).r;
	var parent = /** @type {Effect} */ (active_effect);

	effect(() => {
		/** @type {unknown[]} */
		var old_parts;

		/** @type {unknown[]} */
		var parts;

		render_effect(() => {
			old_parts = parts;
			// We only track changes to the parts, not the value itself to avoid unnecessary reruns.
			parts = [];

			untrack(() => {
				if (!is_bound_this(get_value(...parts), element_or_component)) {
					update(element_or_component, ...parts);
					// If this is an effect rerun (cause: each block context changes), then nullify the binding at
					// the previous position if it isn't already taken over by a different effect.
					if (old_parts && is_bound_this(get_value(...old_parts), element_or_component)) {
						update(null, ...old_parts);
					}
				}
			});
		});

		return () => {
			// When the bind:this effect is destroyed, we go up the effect parent chain until we find the last parent effect that is destroyed,
			// or the effect containing the component bind:this is in (whichever comes first). That way we can time the nulling of the binding
			// as close to user/developer expectation as possible.
			// TODO Svelte 6: Decide if we want to keep this logic or just always null the binding in the component effect's teardown
			// (which would be simpler, but less intuitive in some cases, and breaks the `ondestroy-before-cleanup` test)
			let p = parent;
			while (p !== component_effect && p.parent !== null && p.parent.f & DESTROYING) {
				p = p.parent;
			}
			const teardown = () => {
				if (parts && is_bound_this(get_value(...parts), element_or_component)) {
					update(null, ...parts);
				}
			};
			const original_teardown = p.teardown;
			p.teardown = () => {
				teardown();
				original_teardown?.();
			};
		};
	});

	return element_or_component;
}

/** @import { ComponentContextLegacy } from '#client' */

/**
 * Legacy-mode only: Call `onMount` callbacks and set up `beforeUpdate`/`afterUpdate` effects
 * @param {boolean} [immutable]
 */
function init(immutable = false) {
	const context = /** @type {ComponentContextLegacy} */ (component_context);

	const callbacks = context.l.u;
	if (!callbacks) return;

	let props = () => deep_read_state(context.s);

	if (immutable) {
		let version = 0;
		let prev = /** @type {Record<string, any>} */ ({});

		// In legacy immutable mode, before/afterUpdate only fire if the object identity of a prop changes
		const d = derived(() => {
			let changed = false;
			const props = context.s;
			for (const key in props) {
				if (props[key] !== prev[key]) {
					prev[key] = props[key];
					changed = true;
				}
			}
			if (changed) version++;
			return version;
		});

		props = () => get(d);
	}

	// beforeUpdate
	if (callbacks.b.length) {
		user_pre_effect(() => {
			observe_all(context, props);
			run_all(callbacks.b);
		});
	}

	// onMount (must run before afterUpdate)
	user_effect(() => {
		const fns = untrack(() => callbacks.m.map(run));
		return () => {
			for (const fn of fns) {
				if (typeof fn === 'function') {
					fn();
				}
			}
		};
	});

	// afterUpdate
	if (callbacks.a.length) {
		user_effect(() => {
			observe_all(context, props);
			run_all(callbacks.a);
		});
	}
}

/**
 * Invoke the getter of all signals associated with a component
 * so they can be registered to the effect this function is called in.
 * @param {ComponentContextLegacy} context
 * @param {(() => void)} props
 */
function observe_all(context, props) {
	if (context.l.s) {
		for (const signal of context.l.s) get(signal);
	}

	props();
}

/**
 * Under some circumstances, imports may be reactive in legacy mode. In that case,
 * they should be using `reactive_import` as part of the transformation
 * @param {() => any} fn
 */
function reactive_import(fn) {
	var s = source(0);

	return function () {
		if (arguments.length === 1) {
			set(s, get(s) + 1);
			return arguments[0];
		} else {
			get(s);
			return fn();
		}
	};
}

/** @import { Derived, Effect, Source } from './types.js' */

/**
 * This function is responsible for synchronizing a possibly bound prop with the inner component state.
 * It is used whenever the compiler sees that the component writes to the prop, or when it has a default prop_value.
 * @template V
 * @param {Record<string, unknown>} props
 * @param {string} key
 * @param {number} flags
 * @param {V | (() => V)} [fallback]
 * @returns {(() => V | ((arg: V) => V) | ((arg: V, mutation: boolean) => V))}
 */
function prop(props, key, flags, fallback) {

	var fallback_value = /** @type {V} */ (fallback);
	var fallback_dirty = true;

	var get_fallback = () => {

		if (fallback_dirty) {
			fallback_dirty = false;

			fallback_value = /** @type {V} */ (fallback);
		}

		return fallback_value;
	};

	/** @type {V} */
	var initial_value;

	{
		initial_value = /** @type {V} */ (props[key]);
	}

	if (initial_value === undefined && fallback !== undefined) {
		initial_value = get_fallback();
	}

	/** @type {() => V} */
	var getter;

	{
		getter = () => {
			var value = /** @type {V} */ (props[key]);
			if (value === undefined) return get_fallback();
			fallback_dirty = true;
			return value;
		};
	}

	// prop is never written to — we only need a getter
	{
		return getter;
	}
}

/** @import { ComponentContext, ComponentContextLegacy } from '#client' */
/** @import { EventDispatcher } from './index.js' */
/** @import { NotFunction } from './internal/types.js' */

if (DEV) {
	/**
	 * @param {string} rune
	 */
	function throw_rune_error(rune) {
		if (!(rune in globalThis)) {
			// TODO if people start adjusting the "this can contain runes" config through v-p-s more, adjust this message
			/** @type {any} */
			let value; // let's hope no one modifies this global, but belts and braces
			Object.defineProperty(globalThis, rune, {
				configurable: true,
				// eslint-disable-next-line getter-return
				get: () => {
					if (value !== undefined) {
						return value;
					}

					rune_outside_svelte(rune);
				},
				set: (v) => {
					value = v;
				}
			});
		}
	}

	throw_rune_error('$state');
	throw_rune_error('$effect');
	throw_rune_error('$derived');
	throw_rune_error('$inspect');
	throw_rune_error('$props');
	throw_rune_error('$bindable');
}

/**
 * `onMount`, like [`$effect`](https://svelte.dev/docs/svelte/$effect), schedules a function to run as soon as the component has been mounted to the DOM.
 * Unlike `$effect`, the provided function only runs once.
 *
 * It must be called during the component's initialisation (but doesn't need to live _inside_ the component;
 * it can be called from an external module). If a function is returned _synchronously_ from `onMount`,
 * it will be called when the component is unmounted.
 *
 * `onMount` functions do not run during [server-side rendering](https://svelte.dev/docs/svelte/svelte-server#render).
 *
 * @template T
 * @param {() => NotFunction<T> | Promise<NotFunction<T>> | (() => any)} fn
 * @returns {void}
 */
function onMount(fn) {
	if (component_context === null) {
		lifecycle_outside_component('onMount');
	}

	if (legacy_mode_flag && component_context.l !== null) {
		init_update_callbacks(component_context).m.push(fn);
	} else {
		user_effect(() => {
			const cleanup = untrack(fn);
			if (typeof cleanup === 'function') return /** @type {() => void} */ (cleanup);
		});
	}
}

/**
 * Schedules a callback to run immediately before the component is unmounted.
 *
 * Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
 * only one that runs inside a server-side component.
 *
 * @param {() => any} fn
 * @returns {void}
 */
function onDestroy(fn) {
	if (component_context === null) {
		lifecycle_outside_component('onDestroy');
	}

	onMount(() => () => untrack(fn));
}

/**
 * Legacy-mode: Init callbacks object for onMount/beforeUpdate/afterUpdate
 * @param {ComponentContext} context
 */
function init_update_callbacks(context) {
	var l = /** @type {ComponentContextLegacy} */ (context).l;
	return (l.u ??= { a: [], b: [], m: [] });
}

// generated during release, do not modify

const PUBLIC_VERSION = '5';

if (typeof window !== 'undefined') {
	// @ts-expect-error
	((window.__svelte ??= {}).v ??= new Set()).add(PUBLIC_VERSION);
}

// 唯一出网口：所有 HTTP 与 SSE 都从这里走，组件不直接 fetch。

const BASE = '';

async function getJSON(path, params) {
  const url = new URL(BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + path);
  return res.json();
}

async function postJSON(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).detail || '';
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(detail || 'HTTP ' + res.status + ' ' + path);
  }
  return res.json();
}

const api = {
  stats: () => getJSON('/api/stats'),
  facets: () => getJSON('/api/facets'),
  units: () => getJSON('/api/units'),
  unit: (code, limit = 200) => getJSON('/api/unit', { code, limit }),
  concepts: () => getJSON('/api/concepts'),
  concept: (term) => getJSON('/api/concept', { term }),
  compare: (a, b) => getJSON('/api/compare', { a, b }),
  term: (term) => getJSON('/api/term', { term }),
  quote: (params) => getJSON('/api/quote', params),
  context: (chunkId) => getJSON('/api/context', { chunk_id: chunkId }),
  starmap: () => getJSON('/api/starmap'),
  ask: (body) => postJSON('/api/ask', body),
};

/**
 * SSE：用 fetch + ReadableStream 消费 meta → delta… → done。
 * EventSource 只能 GET，带不了 POST body 里的 conversation_id 与 strategy。
 */
async function streamAsk({ question, strategy = 'auto', conversationId = null }, handlers) {
  const body = { question, strategy };
  if (conversationId) body.conversation_id = conversationId;

  const res = await fetch(BASE + '/api/ask_stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error('流式接口没有响应');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (event) => {
    if (!event || !event.type) return;
    if (event.type === 'meta') handlers.onMeta && handlers.onMeta(event);
    else if (event.type === 'delta') handlers.onDelta && handlers.onDelta(event.text || '');
    else if (event.type === 'done') handlers.onDone && handlers.onDone(event);
    else if (event.type === 'error') handlers.onError && handlers.onError(event.detail || '生成失败');
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          dispatch(JSON.parse(payload));
        } catch {
          /* 坏帧跳过，不影响后续事件 */
        }
      }
    }
  }
  handlers.onClose && handlers.onClose();
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var dexie$1 = {exports: {}};

/*
 * Dexie.js - a minimalistic wrapper for IndexedDB
 * ===============================================
 *
 * By David Fahlander, david.fahlander@gmail.com
 *
 * Version 4.4.6, Thu Sep 10 2026
 *
 * https://dexie.org
 *
 * Apache License Version 2.0, January 2004, http://www.apache.org/licenses/
 */
var dexie = dexie$1.exports;

var hasRequiredDexie;

function requireDexie () {
	if (hasRequiredDexie) return dexie$1.exports;
	hasRequiredDexie = 1;
	(function (module, exports) {
		(function (global, factory) {
		  module.exports = factory() ;
		})(dexie, (function () {
		  var extendStatics = function(d, b) {
		    extendStatics = Object.setPrototypeOf ||
		        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
		        function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
		    return extendStatics(d, b);
		  };
		  function __extends(d, b) {
		    if (typeof b !== "function" && b !== null)
		        throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
		    extendStatics(d, b);
		    function __() { this.constructor = d; }
		    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
		  }
		  var __assign = function() {
		    __assign = Object.assign || function __assign(t) {
		        for (var s, i = 1, n = arguments.length; i < n; i++) {
		            s = arguments[i];
		            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
		        }
		        return t;
		    };
		    return __assign.apply(this, arguments);
		  };
		  function __spreadArray(to, from, pack) {
		    for (var i = 0, l = from.length, ar; i < l; i++) {
		        if (ar || !(i in from)) {
		            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
		            ar[i] = from[i];
		        }
		    }
		    return to.concat(ar || Array.prototype.slice.call(from));
		  }
		  typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
		    var e = new Error(message);
		    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
		  };

		  var _global = typeof globalThis !== 'undefined'
		      ? globalThis
		      : typeof self !== 'undefined'
		          ? self
		          : typeof window !== 'undefined'
		              ? window
		              : commonjsGlobal;

		  var keys = Object.keys;
		  var isArray = Array.isArray;
		  if (typeof Promise !== 'undefined' && !_global.Promise) {
		      _global.Promise = Promise;
		  }
		  function extend(obj, extension) {
		      if (typeof extension !== 'object')
		          return obj;
		      keys(extension).forEach(function (key) {
		          obj[key] = extension[key];
		      });
		      return obj;
		  }
		  var getProto = Object.getPrototypeOf;
		  var _hasOwn = {}.hasOwnProperty;
		  function hasOwn(obj, prop) {
		      return _hasOwn.call(obj, prop);
		  }
		  function props(proto, extension) {
		      if (typeof extension === 'function')
		          extension = extension(getProto(proto));
		      (typeof Reflect === 'undefined' ? keys : Reflect.ownKeys)(extension).forEach(function (key) {
		          setProp(proto, key, extension[key]);
		      });
		  }
		  var defineProperty = Object.defineProperty;
		  function setProp(obj, prop, functionOrGetSet, options) {
		      defineProperty(obj, prop, extend(functionOrGetSet &&
		          hasOwn(functionOrGetSet, 'get') &&
		          typeof functionOrGetSet.get === 'function'
		          ? {
		              get: functionOrGetSet.get,
		              set: functionOrGetSet.set,
		              configurable: true,
		          }
		          : { value: functionOrGetSet, configurable: true, writable: true }, options));
		  }
		  function derive(Child) {
		      return {
		          from: function (Parent) {
		              Child.prototype = Object.create(Parent.prototype);
		              setProp(Child.prototype, 'constructor', Child);
		              return {
		                  extend: props.bind(null, Child.prototype),
		              };
		          },
		      };
		  }
		  var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
		  function getPropertyDescriptor(obj, prop) {
		      var pd = getOwnPropertyDescriptor(obj, prop);
		      var proto;
		      return pd || ((proto = getProto(obj)) && getPropertyDescriptor(proto, prop));
		  }
		  var _slice = [].slice;
		  function slice(args, start, end) {
		      return _slice.call(args, start, end);
		  }
		  function override(origFunc, overridedFactory) {
		      return overridedFactory(origFunc);
		  }
		  function assert(b) {
		      if (!b)
		          throw new Error('Assertion Failed');
		  }
		  function asap$1(fn) {
		      if (_global.setImmediate)
		          setImmediate(fn);
		      else
		          setTimeout(fn, 0);
		  }
		  function arrayToObject(array, extractor) {
		      return array.reduce(function (result, item, i) {
		          var nameAndValue = extractor(item, i);
		          if (nameAndValue)
		              result[nameAndValue[0]] = nameAndValue[1];
		          return result;
		      }, {});
		  }
		  function getByKeyPath(obj, keyPath) {
		      if (typeof keyPath === 'string' && hasOwn(obj, keyPath))
		          return obj[keyPath];
		      if (!keyPath)
		          return obj;
		      if (typeof keyPath !== 'string') {
		          var rv = [];
		          for (var i = 0, l = keyPath.length; i < l; ++i) {
		              var val = getByKeyPath(obj, keyPath[i]);
		              rv.push(val);
		          }
		          return rv;
		      }
		      var period = keyPath.indexOf('.');
		      if (period !== -1) {
		          var innerObj = obj[keyPath.substr(0, period)];
		          return innerObj == null
		              ? undefined
		              : getByKeyPath(innerObj, keyPath.substr(period + 1));
		      }
		      return undefined;
		  }
		  function setByKeyPath(obj, keyPath, value) {
		      if (!obj || keyPath === undefined)
		          return;
		      if ('isFrozen' in Object && Object.isFrozen(obj))
		          return;
		      if (typeof keyPath !== 'string' && 'length' in keyPath) {
		          assert(typeof value !== 'string' && 'length' in value);
		          for (var i = 0, l = keyPath.length; i < l; ++i) {
		              setByKeyPath(obj, keyPath[i], value[i]);
		          }
		      }
		      else {
		          var period = keyPath.indexOf('.');
		          if (period !== -1) {
		              var currentKeyPath = keyPath.substr(0, period);
		              var remainingKeyPath = keyPath.substr(period + 1);
		              if (remainingKeyPath === '')
		                  if (value === undefined) {
		                      if (isArray(obj) && !isNaN(parseInt(currentKeyPath)))
		                          obj.splice(currentKeyPath, 1);
		                      else
		                          delete obj[currentKeyPath];
		                  }
		                  else
		                      obj[currentKeyPath] = value;
		              else {
		                  var innerObj = obj[currentKeyPath];
		                  if (!innerObj || !hasOwn(obj, currentKeyPath)) {
		                      if (value === undefined)
		                          return;
		                      innerObj = obj[currentKeyPath] = {};
		                  }
		                  setByKeyPath(innerObj, remainingKeyPath, value);
		              }
		          }
		          else {
		              if (value === undefined) {
		                  if (isArray(obj) && !isNaN(parseInt(keyPath)))
		                      obj.splice(keyPath, 1);
		                  else
		                      delete obj[keyPath];
		              }
		              else
		                  obj[keyPath] = value;
		          }
		      }
		  }
		  function delByKeyPath(obj, keyPath) {
		      if (typeof keyPath === 'string')
		          setByKeyPath(obj, keyPath, undefined);
		      else if ('length' in keyPath)
		          [].map.call(keyPath, function (kp) {
		              setByKeyPath(obj, kp, undefined);
		          });
		  }
		  function shallowClone(obj) {
		      var rv = {};
		      for (var m in obj) {
		          if (hasOwn(obj, m))
		              rv[m] = obj[m];
		      }
		      return rv;
		  }
		  var concat = [].concat;
		  function flatten(a) {
		      return concat.apply([], a);
		  }
		  var intrinsicTypeNames = 'BigUint64Array,BigInt64Array,Array,Boolean,String,Date,RegExp,Blob,File,FileList,FileSystemFileHandle,FileSystemDirectoryHandle,ArrayBuffer,DataView,Uint8ClampedArray,ImageBitmap,ImageData,Map,Set,CryptoKey'
		      .split(',')
		      .concat(flatten([8, 16, 32, 64].map(function (num) {
		      return ['Int', 'Uint', 'Float'].map(function (t) { return t + num + 'Array'; });
		  })))
		      .filter(function (t) { return _global[t]; });
		  var intrinsicTypes = new Set(intrinsicTypeNames.map(function (t) { return _global[t]; }));
		  function cloneSimpleObjectTree(o) {
		      var rv = {};
		      for (var k in o)
		          if (hasOwn(o, k)) {
		              var v = o[k];
		              rv[k] =
		                  !v || typeof v !== 'object' || intrinsicTypes.has(v.constructor)
		                      ? v
		                      : cloneSimpleObjectTree(v);
		          }
		      return rv;
		  }
		  var circularRefs = null;
		  function deepClone(any) {
		      circularRefs = new WeakMap();
		      var rv = innerDeepClone(any);
		      circularRefs = null;
		      return rv;
		  }
		  function innerDeepClone(x) {
		      if (!x || typeof x !== 'object')
		          return x;
		      var rv = circularRefs.get(x);
		      if (rv)
		          return rv;
		      if (isArray(x)) {
		          rv = [];
		          circularRefs.set(x, rv);
		          for (var i = 0, l = x.length; i < l; ++i) {
		              rv.push(innerDeepClone(x[i]));
		          }
		      }
		      else if (intrinsicTypes.has(x.constructor)) {
		          rv = x;
		      }
		      else {
		          var proto = getProto(x);
		          rv = proto === Object.prototype ? {} : Object.create(proto);
		          circularRefs.set(x, rv);
		          for (var prop in x) {
		              if (hasOwn(x, prop)) {
		                  rv[prop] = innerDeepClone(x[prop]);
		              }
		          }
		      }
		      return rv;
		  }
		  var toString = {}.toString;
		  function toStringTag(o) {
		      return toString.call(o).slice(8, -1);
		  }
		  var iteratorSymbol = typeof Symbol !== 'undefined' ? Symbol.iterator : '@@iterator';
		  var getIteratorOf = typeof iteratorSymbol === 'symbol'
		      ? function (x) {
		          var i;
		          return x != null && (i = x[iteratorSymbol]) && i.apply(x);
		      }
		      : function () {
		          return null;
		      };
		  function delArrayItem(a, x) {
		      var i = a.indexOf(x);
		      if (i >= 0)
		          a.splice(i, 1);
		      return i >= 0;
		  }
		  var NO_CHAR_ARRAY = {};
		  function getArrayOf(arrayLike) {
		      var i, a, x, it;
		      if (arguments.length === 1) {
		          if (isArray(arrayLike))
		              return arrayLike.slice();
		          if (this === NO_CHAR_ARRAY && typeof arrayLike === 'string')
		              return [arrayLike];
		          if ((it = getIteratorOf(arrayLike))) {
		              a = [];
		              while (((x = it.next()), !x.done))
		                  a.push(x.value);
		              return a;
		          }
		          if (arrayLike == null)
		              return [arrayLike];
		          i = arrayLike.length;
		          if (typeof i === 'number') {
		              a = new Array(i);
		              while (i--)
		                  a[i] = arrayLike[i];
		              return a;
		          }
		          return [arrayLike];
		      }
		      i = arguments.length;
		      a = new Array(i);
		      while (i--)
		          a[i] = arguments[i];
		      return a;
		  }
		  var isAsyncFunction = typeof Symbol !== 'undefined'
		      ? function (fn) { return fn[Symbol.toStringTag] === 'AsyncFunction'; }
		      : function () { return false; };

		  var dexieErrorNames = [
		      'Modify',
		      'Bulk',
		      'OpenFailed',
		      'VersionChange',
		      'Schema',
		      'Upgrade',
		      'InvalidTable',
		      'MissingAPI',
		      'NoSuchDatabase',
		      'InvalidArgument',
		      'SubTransaction',
		      'Unsupported',
		      'Internal',
		      'DatabaseClosed',
		      'PrematureCommit',
		      'ForeignAwait',
		  ];
		  var idbDomErrorNames = [
		      'Unknown',
		      'Constraint',
		      'Data',
		      'TransactionInactive',
		      'ReadOnly',
		      'Version',
		      'NotFound',
		      'InvalidState',
		      'InvalidAccess',
		      'Abort',
		      'Timeout',
		      'QuotaExceeded',
		      'Syntax',
		      'DataClone',
		  ];
		  var errorList = dexieErrorNames.concat(idbDomErrorNames);
		  var defaultTexts = {
		      VersionChanged: 'Database version changed by other database connection',
		      DatabaseClosed: 'Database has been closed',
		      Abort: 'Transaction aborted',
		      TransactionInactive: 'Transaction has already completed or failed',
		      MissingAPI: 'IndexedDB API missing. Please visit https://tinyurl.com/y2uuvskb',
		  };
		  function DexieError(name, msg) {
		      this.name = name;
		      this.message = msg;
		  }
		  derive(DexieError)
		      .from(Error)
		      .extend({
		      toString: function () {
		          return this.name + ': ' + this.message;
		      },
		  });
		  function getMultiErrorMessage(msg, failures) {
		      return (msg +
		          '. Errors: ' +
		          Object.keys(failures)
		              .map(function (key) { return failures[key].toString(); })
		              .filter(function (v, i, s) { return s.indexOf(v) === i; })
		              .join('\n'));
		  }
		  function ModifyError(msg, failures, successCount, failedKeys) {
		      this.failures = failures;
		      this.failedKeys = failedKeys;
		      this.successCount = successCount;
		      this.message = getMultiErrorMessage(msg, failures);
		  }
		  derive(ModifyError).from(DexieError);
		  function BulkError(msg, failures) {
		      this.name = 'BulkError';
		      this.failures = Object.keys(failures).map(function (pos) { return failures[pos]; });
		      this.failuresByPos = failures;
		      this.message = getMultiErrorMessage(msg, this.failures);
		  }
		  derive(BulkError).from(DexieError);
		  var errnames = errorList.reduce(function (obj, name) { return ((obj[name] = name + 'Error'), obj); }, {});
		  var BaseException = DexieError;
		  var exceptions = errorList.reduce(function (obj, name) {
		      var fullName = name + 'Error';
		      function DexieError(msgOrInner, inner) {
		          this.name = fullName;
		          if (!msgOrInner) {
		              this.message = defaultTexts[name] || fullName;
		              this.inner = null;
		          }
		          else if (typeof msgOrInner === 'string') {
		              this.message = "".concat(msgOrInner).concat(!inner ? '' : '\n ' + inner);
		              this.inner = inner || null;
		          }
		          else if (typeof msgOrInner === 'object') {
		              this.message = "".concat(msgOrInner.name, " ").concat(msgOrInner.message);
		              this.inner = msgOrInner;
		          }
		      }
		      derive(DexieError).from(BaseException);
		      obj[name] = DexieError;
		      return obj;
		  }, {});
		  exceptions.Syntax = SyntaxError;
		  exceptions.Type = TypeError;
		  exceptions.Range = RangeError;
		  var exceptionMap = idbDomErrorNames.reduce(function (obj, name) {
		      obj[name + 'Error'] = exceptions[name];
		      return obj;
		  }, {});
		  function mapError(domError, message) {
		      if (!domError ||
		          domError instanceof DexieError ||
		          domError instanceof TypeError ||
		          domError instanceof SyntaxError ||
		          !domError.name ||
		          !exceptionMap[domError.name])
		          return domError;
		      var rv = new exceptionMap[domError.name](message || domError.message, domError);
		      if ('stack' in domError) {
		          setProp(rv, 'stack', {
		              get: function () {
		                  return this.inner.stack;
		              },
		          });
		      }
		      return rv;
		  }
		  var fullNameExceptions = errorList.reduce(function (obj, name) {
		      if (['Syntax', 'Type', 'Range'].indexOf(name) === -1)
		          obj[name + 'Error'] = exceptions[name];
		      return obj;
		  }, {});
		  fullNameExceptions.ModifyError = ModifyError;
		  fullNameExceptions.DexieError = DexieError;
		  fullNameExceptions.BulkError = BulkError;

		  function nop() { }
		  function mirror(val) {
		      return val;
		  }
		  function pureFunctionChain(f1, f2) {
		      if (f1 == null || f1 === mirror)
		          return f2;
		      return function (val) {
		          return f2(f1(val));
		      };
		  }
		  function callBoth(on1, on2) {
		      return function () {
		          on1.apply(this, arguments);
		          on2.apply(this, arguments);
		      };
		  }
		  function hookCreatingChain(f1, f2) {
		      if (f1 === nop)
		          return f2;
		      return function () {
		          var res = f1.apply(this, arguments);
		          if (res !== undefined)
		              arguments[0] = res;
		          var onsuccess = this.onsuccess,
		          onerror = this.onerror;
		          this.onsuccess = null;
		          this.onerror = null;
		          var res2 = f2.apply(this, arguments);
		          if (onsuccess)
		              this.onsuccess = this.onsuccess
		                  ? callBoth(onsuccess, this.onsuccess)
		                  : onsuccess;
		          if (onerror)
		              this.onerror = this.onerror ? callBoth(onerror, this.onerror) : onerror;
		          return res2 !== undefined ? res2 : res;
		      };
		  }
		  function hookDeletingChain(f1, f2) {
		      if (f1 === nop)
		          return f2;
		      return function () {
		          f1.apply(this, arguments);
		          var onsuccess = this.onsuccess,
		          onerror = this.onerror;
		          this.onsuccess = this.onerror = null;
		          f2.apply(this, arguments);
		          if (onsuccess)
		              this.onsuccess = this.onsuccess
		                  ? callBoth(onsuccess, this.onsuccess)
		                  : onsuccess;
		          if (onerror)
		              this.onerror = this.onerror ? callBoth(onerror, this.onerror) : onerror;
		      };
		  }
		  function hookUpdatingChain(f1, f2) {
		      if (f1 === nop)
		          return f2;
		      return function () {
		          var res = f1.apply(this, arguments);
		          var modifications = arguments[0];
		          extend(modifications, res);
		          var onsuccess = this.onsuccess,
		          onerror = this.onerror;
		          this.onsuccess = null;
		          this.onerror = null;
		          var res2 = f2.apply(this, arguments);
		          if (onsuccess)
		              this.onsuccess = this.onsuccess
		                  ? callBoth(onsuccess, this.onsuccess)
		                  : onsuccess;
		          if (onerror)
		              this.onerror = this.onerror ? callBoth(onerror, this.onerror) : onerror;
		          return res === undefined
		              ? res2 === undefined
		                  ? undefined
		                  : res2
		              : extend(res, res2);
		      };
		  }
		  function reverseStoppableEventChain(f1, f2) {
		      if (f1 === nop)
		          return f2;
		      return function () {
		          if (f2.apply(this, arguments) === false)
		              return false;
		          return f1.apply(this, arguments);
		      };
		  }
		  function promisableChain(f1, f2) {
		      if (f1 === nop)
		          return f2;
		      return function () {
		          var res = f1.apply(this, arguments);
		          if (res && typeof res.then === 'function') {
		              var thiz = this, i = arguments.length, args = new Array(i);
		              while (i--)
		                  args[i] = arguments[i];
		              return res.then(function () {
		                  return f2.apply(thiz, args);
		              });
		          }
		          return f2.apply(this, arguments);
		      };
		  }

		  var debug = typeof location !== 'undefined' &&
		      /^(http|https):\/\/(localhost|127\.0\.0\.1)/.test(location.href);
		  function setDebug(value, filter) {
		      debug = value;
		  }

		  var INTERNAL = {};
		  var ZONE_ECHO_LIMIT = 100, _a$1 = typeof Promise === 'undefined'
		      ? []
		      : (function () {
		          var globalP = Promise.resolve();
		          if (typeof crypto === 'undefined' || !crypto.subtle)
		              return [globalP, getProto(globalP), globalP];
		          var nativeP = crypto.subtle.digest('SHA-512', new Uint8Array([0]));
		          return [nativeP, getProto(nativeP), globalP];
		      })(), resolvedNativePromise = _a$1[0], nativePromiseProto = _a$1[1], resolvedGlobalPromise = _a$1[2], nativePromiseThen = nativePromiseProto && nativePromiseProto.then;
		  var NativePromise = resolvedNativePromise && resolvedNativePromise.constructor;
		  var patchGlobalPromise = !!resolvedGlobalPromise;
		  function schedulePhysicalTick() {
		      queueMicrotask(physicalTick);
		  }
		  var asap = function (callback, args) {
		      microtickQueue.push([callback, args]);
		      if (needsNewPhysicalTick) {
		          schedulePhysicalTick();
		          needsNewPhysicalTick = false;
		      }
		  };
		  var isOutsideMicroTick = true,
		  needsNewPhysicalTick = true,
		  unhandledErrors = [],
		  rejectingErrors = [],
		  rejectionMapper = mirror;
		  var globalPSD = {
		      id: 'global',
		      global: true,
		      ref: 0,
		      unhandleds: [],
		      onunhandled: nop,
		      pgp: false,
		      env: {},
		      finalize: nop,
		  };
		  var PSD = globalPSD;
		  var microtickQueue = [];
		  var numScheduledCalls = 0;
		  var tickFinalizers = [];
		  function DexiePromise(fn) {
		      if (typeof this !== 'object')
		          throw new TypeError('Promises must be constructed via new');
		      this._listeners = [];
		      this._lib = false;
		      var psd = (this._PSD = PSD);
		      if (typeof fn !== 'function') {
		          if (fn !== INTERNAL)
		              throw new TypeError('Not a function');
		          this._state = arguments[1];
		          this._value = arguments[2];
		          if (this._state === false)
		              handleRejection(this, this._value);
		          return;
		      }
		      this._state = null;
		      this._value = null;
		      ++psd.ref;
		      executePromiseTask(this, fn);
		  }
		  var thenProp = {
		      get: function () {
		          var psd = PSD, microTaskId = totalEchoes;
		          function then(onFulfilled, onRejected) {
		              var _this = this;
		              var possibleAwait = !psd.global && (psd !== PSD || microTaskId !== totalEchoes);
		              var cleanup = possibleAwait && !decrementExpectedAwaits();
		              var rv = new DexiePromise(function (resolve, reject) {
		                  propagateToListener(_this, new Listener(nativeAwaitCompatibleWrap(onFulfilled, psd, possibleAwait, cleanup), nativeAwaitCompatibleWrap(onRejected, psd, possibleAwait, cleanup), resolve, reject, psd));
		              });
		              if (this._consoleTask)
		                  rv._consoleTask = this._consoleTask;
		              return rv;
		          }
		          then.prototype = INTERNAL;
		          return then;
		      },
		      set: function (value) {
		          setProp(this, 'then', value && value.prototype === INTERNAL
		              ? thenProp
		              : {
		                  get: function () {
		                      return value;
		                  },
		                  set: thenProp.set,
		              });
		      },
		  };
		  props(DexiePromise.prototype, {
		      then: thenProp,
		      _then: function (onFulfilled, onRejected) {
		          propagateToListener(this, new Listener(null, null, onFulfilled, onRejected, PSD));
		      },
		      catch: function (onRejected) {
		          if (arguments.length === 1)
		              return this.then(null, onRejected);
		          var type = arguments[0], handler = arguments[1];
		          return typeof type === 'function'
		              ? this.then(null, function (err) {
		                  return err instanceof type ? handler(err) : PromiseReject(err);
		              })
		              : this.then(null, function (err) {
		                  return err && err.name === type ? handler(err) : PromiseReject(err);
		              });
		      },
		      finally: function (onFinally) {
		          return this.then(function (value) {
		              return DexiePromise.resolve(onFinally()).then(function () { return value; });
		          }, function (err) {
		              return DexiePromise.resolve(onFinally()).then(function () { return PromiseReject(err); });
		          });
		      },
		      timeout: function (ms, msg) {
		          var _this = this;
		          return ms < Infinity
		              ? new DexiePromise(function (resolve, reject) {
		                  var handle = setTimeout(function () { return reject(new exceptions.Timeout(msg)); }, ms);
		                  _this.then(resolve, reject).finally(clearTimeout.bind(null, handle));
		              })
		              : this;
		      },
		  });
		  if (typeof Symbol !== 'undefined' && Symbol.toStringTag)
		      setProp(DexiePromise.prototype, Symbol.toStringTag, 'Dexie.Promise');
		  globalPSD.env = snapShot();
		  function Listener(onFulfilled, onRejected, resolve, reject, zone) {
		      this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
		      this.onRejected = typeof onRejected === 'function' ? onRejected : null;
		      this.resolve = resolve;
		      this.reject = reject;
		      this.psd = zone;
		  }
		  props(DexiePromise, {
		      all: function () {
		          var values = getArrayOf
		              .apply(null, arguments)
		              .map(onPossibleParallellAsync);
		          return new DexiePromise(function (resolve, reject) {
		              if (values.length === 0)
		                  resolve([]);
		              var remaining = values.length;
		              values.forEach(function (a, i) {
		                  return DexiePromise.resolve(a).then(function (x) {
		                      values[i] = x;
		                      if (!--remaining)
		                          resolve(values);
		                  }, reject);
		              });
		          });
		      },
		      resolve: function (value) {
		          if (value instanceof DexiePromise)
		              return value;
		          if (value && typeof value.then === 'function')
		              return new DexiePromise(function (resolve, reject) {
		                  value.then(resolve, reject);
		              });
		          var rv = new DexiePromise(INTERNAL, true, value);
		          return rv;
		      },
		      reject: PromiseReject,
		      race: function () {
		          var values = getArrayOf
		              .apply(null, arguments)
		              .map(onPossibleParallellAsync);
		          return new DexiePromise(function (resolve, reject) {
		              values.map(function (value) { return DexiePromise.resolve(value).then(resolve, reject); });
		          });
		      },
		      PSD: {
		          get: function () { return PSD; },
		          set: function (value) { return (PSD = value); },
		      },
		      totalEchoes: { get: function () { return totalEchoes; } },
		      newPSD: newScope,
		      usePSD: usePSD,
		      scheduler: {
		          get: function () { return asap; },
		          set: function (value) {
		              asap = value;
		          },
		      },
		      rejectionMapper: {
		          get: function () { return rejectionMapper; },
		          set: function (value) {
		              rejectionMapper = value;
		          },
		      },
		      follow: function (fn, zoneProps) {
		          return new DexiePromise(function (resolve, reject) {
		              return newScope(function (resolve, reject) {
		                  var psd = PSD;
		                  psd.unhandleds = [];
		                  psd.onunhandled = reject;
		                  psd.finalize = callBoth(function () {
		                      var _this = this;
		                      run_at_end_of_this_or_next_physical_tick(function () {
		                          _this.unhandleds.length === 0
		                              ? resolve()
		                              : reject(_this.unhandleds[0]);
		                      });
		                  }, psd.finalize);
		                  fn();
		              }, zoneProps, resolve, reject);
		          });
		      },
		  });
		  if (NativePromise) {
		      if (NativePromise.allSettled)
		          setProp(DexiePromise, 'allSettled', function () {
		              var possiblePromises = getArrayOf
		                  .apply(null, arguments)
		                  .map(onPossibleParallellAsync);
		              return new DexiePromise(function (resolve) {
		                  if (possiblePromises.length === 0)
		                      resolve([]);
		                  var remaining = possiblePromises.length;
		                  var results = new Array(remaining);
		                  possiblePromises.forEach(function (p, i) {
		                      return DexiePromise.resolve(p)
		                          .then(function (value) { return (results[i] = { status: 'fulfilled', value: value }); }, function (reason) { return (results[i] = { status: 'rejected', reason: reason }); })
		                          .then(function () { return --remaining || resolve(results); });
		                  });
		              });
		          });
		      if (NativePromise.any && typeof AggregateError !== 'undefined')
		          setProp(DexiePromise, 'any', function () {
		              var possiblePromises = getArrayOf
		                  .apply(null, arguments)
		                  .map(onPossibleParallellAsync);
		              return new DexiePromise(function (resolve, reject) {
		                  if (possiblePromises.length === 0)
		                      reject(new AggregateError([]));
		                  var remaining = possiblePromises.length;
		                  var failures = new Array(remaining);
		                  possiblePromises.forEach(function (p, i) {
		                      return DexiePromise.resolve(p).then(function (value) { return resolve(value); }, function (failure) {
		                          failures[i] = failure;
		                          if (!--remaining)
		                              reject(new AggregateError(failures));
		                      });
		                  });
		              });
		          });
		      if (NativePromise.withResolvers)
		          DexiePromise.withResolvers = NativePromise.withResolvers;
		  }
		  function executePromiseTask(promise, fn) {
		      try {
		          fn(function (value) {
		              if (promise._state !== null)
		                  return;
		              if (value === promise)
		                  throw new TypeError('A promise cannot be resolved with itself.');
		              var shouldExecuteTick = promise._lib && beginMicroTickScope();
		              if (value && typeof value.then === 'function') {
		                  executePromiseTask(promise, function (resolve, reject) {
		                      value instanceof DexiePromise
		                          ? value._then(resolve, reject)
		                          : value.then(resolve, reject);
		                  });
		              }
		              else {
		                  promise._state = true;
		                  promise._value = value;
		                  propagateAllListeners(promise);
		              }
		              if (shouldExecuteTick)
		                  endMicroTickScope();
		          }, handleRejection.bind(null, promise));
		      }
		      catch (ex) {
		          handleRejection(promise, ex);
		      }
		  }
		  function handleRejection(promise, reason) {
		      rejectingErrors.push(reason);
		      if (promise._state !== null)
		          return;
		      var shouldExecuteTick = promise._lib && beginMicroTickScope();
		      reason = rejectionMapper(reason);
		      promise._state = false;
		      promise._value = reason;
		      addPossiblyUnhandledError(promise);
		      propagateAllListeners(promise);
		      if (shouldExecuteTick)
		          endMicroTickScope();
		  }
		  function propagateAllListeners(promise) {
		      var listeners = promise._listeners;
		      promise._listeners = [];
		      for (var i = 0, len = listeners.length; i < len; ++i) {
		          propagateToListener(promise, listeners[i]);
		      }
		      var psd = promise._PSD;
		      --psd.ref || psd.finalize();
		      if (numScheduledCalls === 0) {
		          ++numScheduledCalls;
		          asap(function () {
		              if (--numScheduledCalls === 0)
		                  finalizePhysicalTick();
		          }, []);
		      }
		  }
		  function propagateToListener(promise, listener) {
		      if (promise._state === null) {
		          promise._listeners.push(listener);
		          return;
		      }
		      var cb = promise._state ? listener.onFulfilled : listener.onRejected;
		      if (cb === null) {
		          return (promise._state ? listener.resolve : listener.reject)(promise._value);
		      }
		      ++listener.psd.ref;
		      ++numScheduledCalls;
		      asap(callListener, [cb, promise, listener]);
		  }
		  function callListener(cb, promise, listener) {
		      try {
		          var ret, value = promise._value;
		          if (!promise._state && rejectingErrors.length)
		              rejectingErrors = [];
		          ret =
		              debug && promise._consoleTask
		                  ? promise._consoleTask.run(function () { return cb(value); })
		                  : cb(value);
		          if (!promise._state && rejectingErrors.indexOf(value) === -1) {
		              markErrorAsHandled(promise);
		          }
		          listener.resolve(ret);
		      }
		      catch (e) {
		          listener.reject(e);
		      }
		      finally {
		          if (--numScheduledCalls === 0)
		              finalizePhysicalTick();
		          --listener.psd.ref || listener.psd.finalize();
		      }
		  }
		  function physicalTick() {
		      usePSD(globalPSD, function () {
		          beginMicroTickScope() && endMicroTickScope();
		      });
		  }
		  function beginMicroTickScope() {
		      var wasRootExec = isOutsideMicroTick;
		      isOutsideMicroTick = false;
		      needsNewPhysicalTick = false;
		      return wasRootExec;
		  }
		  function endMicroTickScope() {
		      var callbacks, i, l;
		      do {
		          while (microtickQueue.length > 0) {
		              callbacks = microtickQueue;
		              microtickQueue = [];
		              l = callbacks.length;
		              for (i = 0; i < l; ++i) {
		                  var item = callbacks[i];
		                  item[0].apply(null, item[1]);
		              }
		          }
		      } while (microtickQueue.length > 0);
		      isOutsideMicroTick = true;
		      needsNewPhysicalTick = true;
		  }
		  function finalizePhysicalTick() {
		      var unhandledErrs = unhandledErrors;
		      unhandledErrors = [];
		      unhandledErrs.forEach(function (p) {
		          p._PSD.onunhandled.call(null, p._value, p);
		      });
		      var finalizers = tickFinalizers.slice(0);
		      var i = finalizers.length;
		      while (i)
		          finalizers[--i]();
		  }
		  function run_at_end_of_this_or_next_physical_tick(fn) {
		      function finalizer() {
		          fn();
		          tickFinalizers.splice(tickFinalizers.indexOf(finalizer), 1);
		      }
		      tickFinalizers.push(finalizer);
		      ++numScheduledCalls;
		      asap(function () {
		          if (--numScheduledCalls === 0)
		              finalizePhysicalTick();
		      }, []);
		  }
		  function addPossiblyUnhandledError(promise) {
		      if (!unhandledErrors.some(function (p) { return p._value === promise._value; }))
		          unhandledErrors.push(promise);
		  }
		  function markErrorAsHandled(promise) {
		      var i = unhandledErrors.length;
		      while (i)
		          if (unhandledErrors[--i]._value === promise._value) {
		              unhandledErrors.splice(i, 1);
		              return;
		          }
		  }
		  function PromiseReject(reason) {
		      return new DexiePromise(INTERNAL, false, reason);
		  }
		  function wrap(fn, errorCatcher) {
		      var psd = PSD;
		      return function () {
		          var wasRootExec = beginMicroTickScope(), outerScope = PSD;
		          try {
		              switchToZone(psd, true);
		              return fn.apply(this, arguments);
		          }
		          catch (e) {
		              errorCatcher && errorCatcher(e);
		          }
		          finally {
		              switchToZone(outerScope, false);
		              if (wasRootExec)
		                  endMicroTickScope();
		          }
		      };
		  }
		  var task = { awaits: 0, echoes: 0, id: 0 };
		  var taskCounter = 0;
		  var zoneStack = [];
		  var zoneEchoes = 0;
		  var totalEchoes = 0;
		  var zone_id_counter = 0;
		  function newScope(fn, props, a1, a2) {
		      var parent = PSD, psd = Object.create(parent);
		      psd.parent = parent;
		      psd.ref = 0;
		      psd.global = false;
		      psd.id = ++zone_id_counter;
		      globalPSD.env;
		      psd.env = patchGlobalPromise
		          ? {
		              Promise: DexiePromise,
		              PromiseProp: {
		                  value: DexiePromise,
		                  configurable: true,
		                  writable: true,
		              },
		              all: DexiePromise.all,
		              race: DexiePromise.race,
		              allSettled: DexiePromise.allSettled,
		              any: DexiePromise.any,
		              resolve: DexiePromise.resolve,
		              reject: DexiePromise.reject,
		          }
		          : {};
		      if (props)
		          extend(psd, props);
		      ++parent.ref;
		      psd.finalize = function () {
		          --this.parent.ref || this.parent.finalize();
		      };
		      var rv = usePSD(psd, fn, a1, a2);
		      if (psd.ref === 0)
		          psd.finalize();
		      return rv;
		  }
		  function incrementExpectedAwaits() {
		      if (!task.id)
		          task.id = ++taskCounter;
		      ++task.awaits;
		      task.echoes += ZONE_ECHO_LIMIT;
		      return task.id;
		  }
		  function decrementExpectedAwaits() {
		      if (!task.awaits)
		          return false;
		      if (--task.awaits === 0)
		          task.id = 0;
		      task.echoes = task.awaits * ZONE_ECHO_LIMIT;
		      return true;
		  }
		  if (('' + nativePromiseThen).indexOf('[native code]') === -1) {
		      incrementExpectedAwaits = decrementExpectedAwaits = nop;
		  }
		  function onPossibleParallellAsync(possiblePromise) {
		      if (task.echoes &&
		          possiblePromise &&
		          possiblePromise.constructor === NativePromise) {
		          incrementExpectedAwaits();
		          return possiblePromise.then(function (x) {
		              decrementExpectedAwaits();
		              return x;
		          }, function (e) {
		              decrementExpectedAwaits();
		              return rejection(e);
		          });
		      }
		      return possiblePromise;
		  }
		  function zoneEnterEcho(targetZone) {
		      ++totalEchoes;
		      if (!task.echoes || --task.echoes === 0) {
		          task.echoes = task.awaits = task.id = 0;
		      }
		      zoneStack.push(PSD);
		      switchToZone(targetZone, true);
		  }
		  function zoneLeaveEcho() {
		      var zone = zoneStack[zoneStack.length - 1];
		      zoneStack.pop();
		      switchToZone(zone, false);
		  }
		  function switchToZone(targetZone, bEnteringZone) {
		      var currentZone = PSD;
		      if (bEnteringZone
		          ? task.echoes && (!zoneEchoes++ || targetZone !== PSD)
		          : zoneEchoes && (!--zoneEchoes || targetZone !== PSD)) {
		          queueMicrotask(bEnteringZone ? zoneEnterEcho.bind(null, targetZone) : zoneLeaveEcho);
		      }
		      if (targetZone === PSD)
		          return;
		      PSD = targetZone;
		      if (currentZone === globalPSD)
		          globalPSD.env = snapShot();
		      if (patchGlobalPromise) {
		          var GlobalPromise = globalPSD.env.Promise;
		          var targetEnv = targetZone.env;
		          if (currentZone.global || targetZone.global) {
		              Object.defineProperty(_global, 'Promise', targetEnv.PromiseProp);
		              GlobalPromise.all = targetEnv.all;
		              GlobalPromise.race = targetEnv.race;
		              GlobalPromise.resolve = targetEnv.resolve;
		              GlobalPromise.reject = targetEnv.reject;
		              if (targetEnv.allSettled)
		                  GlobalPromise.allSettled = targetEnv.allSettled;
		              if (targetEnv.any)
		                  GlobalPromise.any = targetEnv.any;
		          }
		      }
		  }
		  function snapShot() {
		      var GlobalPromise = _global.Promise;
		      return patchGlobalPromise
		          ? {
		              Promise: GlobalPromise,
		              PromiseProp: Object.getOwnPropertyDescriptor(_global, 'Promise'),
		              all: GlobalPromise.all,
		              race: GlobalPromise.race,
		              allSettled: GlobalPromise.allSettled,
		              any: GlobalPromise.any,
		              resolve: GlobalPromise.resolve,
		              reject: GlobalPromise.reject,
		          }
		          : {};
		  }
		  function usePSD(psd, fn, a1, a2, a3) {
		      var outerScope = PSD;
		      try {
		          switchToZone(psd, true);
		          return fn(a1, a2, a3);
		      }
		      finally {
		          switchToZone(outerScope, false);
		      }
		  }
		  function nativeAwaitCompatibleWrap(fn, zone, possibleAwait, cleanup) {
		      return typeof fn !== 'function'
		          ? fn
		          : function () {
		              var outerZone = PSD;
		              if (possibleAwait)
		                  incrementExpectedAwaits();
		              switchToZone(zone, true);
		              try {
		                  return fn.apply(this, arguments);
		              }
		              finally {
		                  switchToZone(outerZone, false);
		                  if (cleanup)
		                      queueMicrotask(decrementExpectedAwaits);
		              }
		          };
		  }
		  function execInGlobalContext(cb) {
		      if (Promise === NativePromise && task.echoes === 0) {
		          if (zoneEchoes === 0) {
		              cb();
		          }
		          else {
		              enqueueNativeMicroTask(cb);
		          }
		      }
		      else {
		          setTimeout(cb, 0);
		      }
		  }
		  var rejection = DexiePromise.reject;

		  function tempTransaction(db, mode, storeNames, fn) {
		      if (!db.idbdb || (!db._state.openComplete && !PSD.letThrough && !db._vip)) {
		          if (db._state.openComplete) {
		              return rejection(new exceptions.DatabaseClosed(db._state.dbOpenError));
		          }
		          if (!db._state.isBeingOpened) {
		              if (!db._state.autoOpen)
		                  return rejection(new exceptions.DatabaseClosed());
		              db.open().catch(nop);
		          }
		          return db._state.dbReadyPromise.then(function () {
		              return tempTransaction(db, mode, storeNames, fn);
		          });
		      }
		      else {
		          var trans = db._createTransaction(mode, storeNames, db._dbSchema);
		          try {
		              trans.create();
		              db._state.PR1398_maxLoop = 3;
		          }
		          catch (ex) {
		              if (ex.name === errnames.InvalidState &&
		                  db.isOpen() &&
		                  --db._state.PR1398_maxLoop > 0) {
		                  console.warn('Dexie: Need to reopen db');
		                  db.close({ disableAutoOpen: false });
		                  return db.open().then(function () { return tempTransaction(db, mode, storeNames, fn); });
		              }
		              return rejection(ex);
		          }
		          return trans
		              ._promise(mode, function (resolve, reject) {
		              return newScope(function () {
		                  PSD.trans = trans;
		                  return fn(resolve, reject, trans);
		              });
		          })
		              .then(function (result) {
		              if (mode === 'readwrite')
		                  try {
		                      trans.idbtrans.commit();
		                  }
		                  catch (_a) { }
		              return mode === 'readonly'
		                  ? result
		                  : trans._completion.then(function () { return result; });
		          });
		      }
		  }

		  var DEXIE_VERSION = '4.4.6';
		  var maxString = String.fromCharCode(65535);
		  var minKey = -Infinity;
		  var INVALID_KEY_ARGUMENT = 'Invalid key provided. Keys must be of type string, number, Date or Array<string | number | Date>.';
		  var STRING_EXPECTED = 'String expected.';
		  var DEFAULT_MAX_CONNECTIONS = 1000;
		  var DBNAMES_DB = '__dbnames';
		  var READONLY = 'readonly';
		  var READWRITE = 'readwrite';

		  function combine(filter1, filter2) {
		      return filter1
		          ? filter2
		              ? function () {
		                  return (filter1.apply(this, arguments) && filter2.apply(this, arguments));
		              }
		              : filter1
		          : filter2;
		  }

		  var AnyRange = {
		      type: 3 ,
		      lower: -Infinity,
		      lowerOpen: false,
		      upper: [[]],
		      upperOpen: false,
		  };

		  function workaroundForUndefinedPrimKey(keyPath) {
		      return typeof keyPath === 'string' && !/\./.test(keyPath)
		          ? function (obj) {
		              if (obj[keyPath] === undefined && keyPath in obj) {
		                  obj = deepClone(obj);
		                  delete obj[keyPath];
		              }
		              return obj;
		          }
		          : function (obj) { return obj; };
		  }

		  function Entity() {
		      throw exceptions.Type("Entity instances must never be new:ed. Instances are generated by the framework bypassing the constructor.");
		  }

		  function cmp(a, b) {
		      try {
		          var ta = type(a);
		          var tb = type(b);
		          if (ta !== tb) {
		              if (ta === 'Array')
		                  return 1;
		              if (tb === 'Array')
		                  return -1;
		              if (ta === 'binary')
		                  return 1;
		              if (tb === 'binary')
		                  return -1;
		              if (ta === 'string')
		                  return 1;
		              if (tb === 'string')
		                  return -1;
		              if (ta === 'Date')
		                  return 1;
		              if (tb !== 'Date')
		                  return NaN;
		              return -1;
		          }
		          switch (ta) {
		              case 'number':
		              case 'Date':
		              case 'string':
		                  return a > b ? 1 : a < b ? -1 : 0;
		              case 'binary': {
		                  return compareUint8Arrays(getUint8Array(a), getUint8Array(b));
		              }
		              case 'Array':
		                  return compareArrays(a, b);
		          }
		      }
		      catch (_a) { }
		      return NaN;
		  }
		  function compareArrays(a, b) {
		      var al = a.length;
		      var bl = b.length;
		      var l = al < bl ? al : bl;
		      for (var i = 0; i < l; ++i) {
		          var res = cmp(a[i], b[i]);
		          if (res !== 0)
		              return res;
		      }
		      return al === bl ? 0 : al < bl ? -1 : 1;
		  }
		  function compareUint8Arrays(a, b) {
		      var al = a.length;
		      var bl = b.length;
		      var l = al < bl ? al : bl;
		      for (var i = 0; i < l; ++i) {
		          if (a[i] !== b[i])
		              return a[i] < b[i] ? -1 : 1;
		      }
		      return al === bl ? 0 : al < bl ? -1 : 1;
		  }
		  function type(x) {
		      var t = typeof x;
		      if (t !== 'object')
		          return t;
		      if (ArrayBuffer.isView(x))
		          return 'binary';
		      var tsTag = toStringTag(x);
		      return tsTag === 'ArrayBuffer' ? 'binary' : tsTag;
		  }
		  function getUint8Array(a) {
		      if (a instanceof Uint8Array)
		          return a;
		      if (ArrayBuffer.isView(a))
		          return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
		      return new Uint8Array(a);
		  }

		  function builtInDeletionTrigger(table, keys, res) {
		      var yProps = table.schema.yProps;
		      if (!yProps)
		          return res;
		      if (keys && res.numFailures > 0)
		          keys = keys.filter(function (_, i) { return !res.failures[i]; });
		      return Promise.all(yProps.map(function (_a) {
		          var updatesTable = _a.updatesTable;
		          return keys
		              ? table.db.table(updatesTable).where('k').anyOf(keys).delete()
		              : table.db.table(updatesTable).clear();
		      })).then(function () { return res; });
		  }

		  var PropModification =  (function () {
		      function PropModification(spec) {
		          this['@@propmod'] = spec;
		      }
		      PropModification.prototype.execute = function (value) {
		          var _a;
		          var spec = this['@@propmod'];
		          if (spec.add !== undefined) {
		              var term = spec.add;
		              if (isArray(term)) {
		                  return __spreadArray(__spreadArray([], (isArray(value) ? value : []), true), term).sort();
		              }
		              if (typeof term === 'number')
		                  return (Number(value) || 0) + term;
		              if (typeof term === 'bigint') {
		                  try {
		                      return BigInt(value) + term;
		                  }
		                  catch (_b) {
		                      return BigInt(0) + term;
		                  }
		              }
		              throw new TypeError("Invalid term ".concat(term));
		          }
		          if (spec.remove !== undefined) {
		              var subtrahend_1 = spec.remove;
		              if (isArray(subtrahend_1)) {
		                  return isArray(value)
		                      ? value.filter(function (item) { return !subtrahend_1.includes(item); }).sort()
		                      : [];
		              }
		              if (typeof subtrahend_1 === 'number')
		                  return Number(value) - subtrahend_1;
		              if (typeof subtrahend_1 === 'bigint') {
		                  try {
		                      return BigInt(value) - subtrahend_1;
		                  }
		                  catch (_c) {
		                      return BigInt(0) - subtrahend_1;
		                  }
		              }
		              throw new TypeError("Invalid subtrahend ".concat(subtrahend_1));
		          }
		          var prefixToReplace = (_a = spec.replacePrefix) === null || _a === void 0 ? void 0 : _a[0];
		          if (prefixToReplace &&
		              typeof value === 'string' &&
		              value.startsWith(prefixToReplace)) {
		              return spec.replacePrefix[1] + value.substring(prefixToReplace.length);
		          }
		          return value;
		      };
		      return PropModification;
		  }());

		  function applyUpdateSpec(obj, changes) {
		      var keyPaths = keys(changes);
		      var numKeys = keyPaths.length;
		      var anythingModified = false;
		      for (var i = 0; i < numKeys; ++i) {
		          var keyPath = keyPaths[i];
		          var value = changes[keyPath];
		          var origValue = getByKeyPath(obj, keyPath);
		          if (value instanceof PropModification) {
		              setByKeyPath(obj, keyPath, value.execute(origValue));
		              anythingModified = true;
		          }
		          else if (origValue !== value) {
		              setByKeyPath(obj, keyPath, value);
		              anythingModified = true;
		          }
		      }
		      return anythingModified;
		  }

		  var Table =  (function () {
		      function Table() {
		      }
		      Table.prototype._trans = function (mode, fn, writeLocked) {
		          var trans = this._tx || PSD.trans;
		          var tableName = this.name;
		          var task = debug &&
		              typeof console !== 'undefined' &&
		              console.createTask &&
		              console.createTask("Dexie: ".concat(mode === 'readonly' ? 'read' : 'write', " ").concat(this.name));
		          function checkTableInTransaction(resolve, reject, trans) {
		              if (!trans.schema[tableName])
		                  throw new exceptions.NotFound('Table ' + tableName + ' not part of transaction');
		              return fn(trans.idbtrans, trans);
		          }
		          var wasRootExec = beginMicroTickScope();
		          try {
		              var p = trans && trans.db._novip === this.db._novip
		                  ? trans === PSD.trans
		                      ? trans._promise(mode, checkTableInTransaction, writeLocked)
		                      : newScope(function () {
		                          return trans._promise(mode, checkTableInTransaction, writeLocked);
		                      }, { trans: trans, transless: PSD.transless || PSD })
		                  : tempTransaction(this.db, mode, [this.name], checkTableInTransaction);
		              if (task) {
		                  p._consoleTask = task;
		                  p = p.catch(function (err) {
		                      console.trace(err);
		                      return rejection(err);
		                  });
		              }
		              return p;
		          }
		          finally {
		              if (wasRootExec)
		                  endMicroTickScope();
		          }
		      };
		      Table.prototype.get = function (keyOrCrit, cb) {
		          var _this = this;
		          if (keyOrCrit && keyOrCrit.constructor === Object)
		              return this.where(keyOrCrit).first(cb);
		          if (keyOrCrit == null)
		              return rejection(new exceptions.Type("Invalid argument to Table.get()"));
		          return this._trans('readonly', function (trans) {
		              return _this.core
		                  .get({ trans: trans, key: keyOrCrit })
		                  .then(function (res) { return _this.hook.reading.fire(res); });
		          }).then(cb);
		      };
		      Table.prototype.where = function (indexOrCrit) {
		          if (typeof indexOrCrit === 'string')
		              return new this.db.WhereClause(this, indexOrCrit);
		          if (isArray(indexOrCrit))
		              return new this.db.WhereClause(this, "[".concat(indexOrCrit.join('+'), "]"));
		          var keyPaths = keys(indexOrCrit);
		          if (keyPaths.length === 1)
		              return this.where(keyPaths[0]).equals(indexOrCrit[keyPaths[0]]);
		          var compoundIndex = this.schema.indexes
		              .concat(this.schema.primKey)
		              .filter(function (ix) {
		              if (ix.compound &&
		                  keyPaths.every(function (keyPath) { return ix.keyPath.indexOf(keyPath) >= 0; })) {
		                  for (var i = 0; i < keyPaths.length; ++i) {
		                      if (keyPaths.indexOf(ix.keyPath[i]) === -1)
		                          return false;
		                  }
		                  return true;
		              }
		              return false;
		          })
		              .sort(function (a, b) { return a.keyPath.length - b.keyPath.length; })[0];
		          if (compoundIndex && this.db._maxKey !== maxString) {
		              var keyPathsInValidOrder = compoundIndex.keyPath.slice(0, keyPaths.length);
		              return this.where(keyPathsInValidOrder).equals(keyPathsInValidOrder.map(function (kp) { return indexOrCrit[kp]; }));
		          }
		          if (!compoundIndex && debug)
		              console.warn("The query ".concat(JSON.stringify(indexOrCrit), " on ").concat(this.name, " would benefit from a ") +
		                  "compound index [".concat(keyPaths.join('+'), "]"));
		          var idxByName = this.schema.idxByName;
		          function equals(a, b) {
		              return cmp(a, b) === 0;
		          }
		          var _a = keyPaths.reduce(function (_a, keyPath) {
		              var prevIndex = _a[0], prevFilterFn = _a[1];
		              var index = idxByName[keyPath];
		              var value = indexOrCrit[keyPath];
		              return [
		                  prevIndex || index,
		                  prevIndex || !index
		                      ? combine(prevFilterFn, index && index.multi
		                          ? function (x) {
		                              var prop = getByKeyPath(x, keyPath);
		                              return (isArray(prop) &&
		                                  prop.some(function (item) { return equals(value, item); }));
		                          }
		                          : function (x) { return equals(value, getByKeyPath(x, keyPath)); })
		                      : prevFilterFn,
		              ];
		          }, [null, null]), idx = _a[0], filterFunction = _a[1];
		          return idx
		              ? this.where(idx.name)
		                  .equals(indexOrCrit[idx.keyPath])
		                  .filter(filterFunction)
		              : compoundIndex
		                  ? this.filter(filterFunction)
		                  : this.where(keyPaths).equals('');
		      };
		      Table.prototype.filter = function (filterFunction) {
		          return this.toCollection().and(filterFunction);
		      };
		      Table.prototype.count = function (thenShortcut) {
		          return this.toCollection().count(thenShortcut);
		      };
		      Table.prototype.offset = function (offset) {
		          return this.toCollection().offset(offset);
		      };
		      Table.prototype.limit = function (numRows) {
		          return this.toCollection().limit(numRows);
		      };
		      Table.prototype.each = function (callback) {
		          return this.toCollection().each(callback);
		      };
		      Table.prototype.toArray = function (thenShortcut) {
		          return this.toCollection().toArray(thenShortcut);
		      };
		      Table.prototype.toCollection = function () {
		          return new this.db.Collection(new this.db.WhereClause(this));
		      };
		      Table.prototype.orderBy = function (index) {
		          return new this.db.Collection(new this.db.WhereClause(this, isArray(index) ? "[".concat(index.join('+'), "]") : index));
		      };
		      Table.prototype.reverse = function () {
		          return this.toCollection().reverse();
		      };
		      Table.prototype.mapToClass = function (constructor) {
		          var _a = this, db = _a.db, tableName = _a.name;
		          this.schema.mappedClass = constructor;
		          if (constructor.prototype instanceof Entity) {
		              constructor =  (function (_super) {
		                  __extends(class_1, _super);
		                  function class_1() {
		                      return _super !== null && _super.apply(this, arguments) || this;
		                  }
		                  Object.defineProperty(class_1.prototype, "db", {
		                      get: function () {
		                          return db;
		                      },
		                      enumerable: false,
		                      configurable: true
		                  });
		                  class_1.prototype.table = function () {
		                      return tableName;
		                  };
		                  return class_1;
		              }(constructor));
		          }
		          var inheritedProps = new Set();
		          for (var proto = constructor.prototype; proto; proto = getProto(proto)) {
		              Object.getOwnPropertyNames(proto).forEach(function (propName) {
		                  return inheritedProps.add(propName);
		              });
		          }
		          var readHook = function (obj) {
		              if (!obj)
		                  return obj;
		              var res = Object.create(constructor.prototype);
		              for (var m in obj)
		                  if (!inheritedProps.has(m))
		                      try {
		                          res[m] = obj[m];
		                      }
		                      catch (_) { }
		              return res;
		          };
		          if (this.schema.readHook) {
		              this.hook.reading.unsubscribe(this.schema.readHook);
		          }
		          this.schema.readHook = readHook;
		          this.hook('reading', readHook);
		          return constructor;
		      };
		      Table.prototype.defineClass = function () {
		          function Class(content) {
		              extend(this, content);
		          }
		          return this.mapToClass(Class);
		      };
		      Table.prototype.add = function (obj, key) {
		          var _this = this;
		          var _a = this.schema.primKey, auto = _a.auto, keyPath = _a.keyPath;
		          var objToAdd = obj;
		          if (keyPath && auto) {
		              objToAdd = workaroundForUndefinedPrimKey(keyPath)(obj);
		          }
		          return this._trans('readwrite', function (trans) {
		              return _this.core.mutate({
		                  trans: trans,
		                  type: 'add',
		                  keys: key != null ? [key] : null,
		                  values: [objToAdd],
		              });
		          })
		              .then(function (res) {
		              return res.numFailures ? DexiePromise.reject(res.failures[0]) : res.lastResult;
		          })
		              .then(function (lastResult) {
		              if (keyPath) {
		                  try {
		                      setByKeyPath(obj, keyPath, lastResult);
		                  }
		                  catch (_) { }
		              }
		              return lastResult;
		          });
		      };
		      Table.prototype.upsert = function (key, modifications) {
		          var _this = this;
		          var keyPath = this.schema.primKey.keyPath;
		          return this._trans('readwrite', function (trans) {
		              return _this.core.get({ trans: trans, key: key }).then(function (existing) {
		                  var obj = existing !== null && existing !== void 0 ? existing : {};
		                  applyUpdateSpec(obj, modifications);
		                  if (keyPath)
		                      setByKeyPath(obj, keyPath, key);
		                  return _this.core
		                      .mutate({
		                      trans: trans,
		                      type: 'put',
		                      values: [obj],
		                      keys: [key],
		                      upsert: true,
		                      updates: { keys: [key], changeSpecs: [modifications] },
		                  })
		                      .then(function (res) {
		                      return res.numFailures ? DexiePromise.reject(res.failures[0]) : !!existing;
		                  });
		              });
		          });
		      };
		      Table.prototype.update = function (keyOrObject, modifications) {
		          if (typeof keyOrObject === 'object' && !isArray(keyOrObject)) {
		              var key = getByKeyPath(keyOrObject, this.schema.primKey.keyPath);
		              if (key === undefined)
		                  return rejection(new exceptions.InvalidArgument('Given object does not contain its primary key'));
		              return this.where(':id').equals(key).modify(modifications);
		          }
		          else {
		              return this.where(':id').equals(keyOrObject).modify(modifications);
		          }
		      };
		      Table.prototype.put = function (obj, key) {
		          var _this = this;
		          var _a = this.schema.primKey, auto = _a.auto, keyPath = _a.keyPath;
		          var objToAdd = obj;
		          if (keyPath && auto) {
		              objToAdd = workaroundForUndefinedPrimKey(keyPath)(obj);
		          }
		          return this._trans('readwrite', function (trans) {
		              return _this.core.mutate({
		                  trans: trans,
		                  type: 'put',
		                  values: [objToAdd],
		                  keys: key != null ? [key] : null,
		              });
		          })
		              .then(function (res) {
		              return res.numFailures ? DexiePromise.reject(res.failures[0]) : res.lastResult;
		          })
		              .then(function (lastResult) {
		              if (keyPath) {
		                  try {
		                      setByKeyPath(obj, keyPath, lastResult);
		                  }
		                  catch (_) { }
		              }
		              return lastResult;
		          });
		      };
		      Table.prototype.delete = function (key) {
		          var _this = this;
		          return this._trans('readwrite', function (trans) {
		              return _this.core
		                  .mutate({ trans: trans, type: 'delete', keys: [key] })
		                  .then(function (res) { return builtInDeletionTrigger(_this, [key], res); })
		                  .then(function (res) {
		                  return res.numFailures ? DexiePromise.reject(res.failures[0]) : undefined;
		              });
		          });
		      };
		      Table.prototype.clear = function () {
		          var _this = this;
		          return this._trans('readwrite', function (trans) {
		              return _this.core
		                  .mutate({ trans: trans, type: 'deleteRange', range: AnyRange })
		                  .then(function (res) { return builtInDeletionTrigger(_this, null, res); });
		          }).then(function (res) {
		              return res.numFailures ? DexiePromise.reject(res.failures[0]) : undefined;
		          });
		      };
		      Table.prototype.bulkGet = function (keys) {
		          var _this = this;
		          return this._trans('readonly', function (trans) {
		              return _this.core
		                  .getMany({
		                  keys: keys,
		                  trans: trans,
		              })
		                  .then(function (result) { return result.map(function (res) { return _this.hook.reading.fire(res); }); });
		          });
		      };
		      Table.prototype.bulkAdd = function (objects, keysOrOptions, options) {
		          var _this = this;
		          var keys = Array.isArray(keysOrOptions) ? keysOrOptions : undefined;
		          options =
		              options || (keys ? undefined : keysOrOptions);
		          var wantResults = options ? options.allKeys : undefined;
		          return this._trans('readwrite', function (trans) {
		              var _a = _this.schema.primKey, auto = _a.auto, keyPath = _a.keyPath;
		              if (keyPath && keys)
		                  throw new exceptions.InvalidArgument('bulkAdd(): keys argument invalid on tables with inbound keys');
		              if (keys && keys.length !== objects.length)
		                  throw new exceptions.InvalidArgument('Arguments objects and keys must have the same length');
		              var numObjects = objects.length;
		              var objectsToAdd = keyPath && auto
		                  ? objects.map(workaroundForUndefinedPrimKey(keyPath))
		                  : objects;
		              return _this.core
		                  .mutate({
		                  trans: trans,
		                  type: 'add',
		                  keys: keys,
		                  values: objectsToAdd,
		                  wantResults: wantResults,
		              })
		                  .then(function (_a) {
		                  var numFailures = _a.numFailures, results = _a.results, lastResult = _a.lastResult, failures = _a.failures;
		                  var result = wantResults ? results : lastResult;
		                  if (numFailures === 0)
		                      return result;
		                  throw new BulkError("".concat(_this.name, ".bulkAdd(): ").concat(numFailures, " of ").concat(numObjects, " operations failed"), failures);
		              });
		          });
		      };
		      Table.prototype.bulkPut = function (objects, keysOrOptions, options) {
		          var _this = this;
		          var keys = Array.isArray(keysOrOptions) ? keysOrOptions : undefined;
		          options =
		              options || (keys ? undefined : keysOrOptions);
		          var wantResults = options ? options.allKeys : undefined;
		          return this._trans('readwrite', function (trans) {
		              var _a = _this.schema.primKey, auto = _a.auto, keyPath = _a.keyPath;
		              if (keyPath && keys)
		                  throw new exceptions.InvalidArgument('bulkPut(): keys argument invalid on tables with inbound keys');
		              if (keys && keys.length !== objects.length)
		                  throw new exceptions.InvalidArgument('Arguments objects and keys must have the same length');
		              var numObjects = objects.length;
		              var objectsToPut = keyPath && auto
		                  ? objects.map(workaroundForUndefinedPrimKey(keyPath))
		                  : objects;
		              return _this.core
		                  .mutate({
		                  trans: trans,
		                  type: 'put',
		                  keys: keys,
		                  values: objectsToPut,
		                  wantResults: wantResults,
		              })
		                  .then(function (_a) {
		                  var numFailures = _a.numFailures, results = _a.results, lastResult = _a.lastResult, failures = _a.failures;
		                  var result = wantResults ? results : lastResult;
		                  if (numFailures === 0)
		                      return result;
		                  throw new BulkError("".concat(_this.name, ".bulkPut(): ").concat(numFailures, " of ").concat(numObjects, " operations failed"), failures);
		              });
		          });
		      };
		      Table.prototype.bulkUpdate = function (keysAndChanges) {
		          var _this = this;
		          var coreTable = this.core;
		          var keys = keysAndChanges.map(function (entry) { return entry.key; });
		          var changeSpecs = keysAndChanges.map(function (entry) { return entry.changes; });
		          var offsetMap = [];
		          return this._trans('readwrite', function (trans) {
		              return coreTable.getMany({ trans: trans, keys: keys, cache: 'clone' }).then(function (objs) {
		                  var resultKeys = [];
		                  var resultObjs = [];
		                  keysAndChanges.forEach(function (_a, idx) {
		                      var key = _a.key, changes = _a.changes;
		                      var obj = objs[idx];
		                      if (obj) {
		                          for (var _i = 0, _b = Object.keys(changes); _i < _b.length; _i++) {
		                              var keyPath = _b[_i];
		                              var value = changes[keyPath];
		                              if (keyPath === _this.schema.primKey.keyPath) {
		                                  if (cmp(value, key) !== 0) {
		                                      throw new exceptions.Constraint("Cannot update primary key in bulkUpdate()");
		                                  }
		                              }
		                              else {
		                                  setByKeyPath(obj, keyPath, value);
		                              }
		                          }
		                          offsetMap.push(idx);
		                          resultKeys.push(key);
		                          resultObjs.push(obj);
		                      }
		                  });
		                  var numEntries = resultKeys.length;
		                  return coreTable
		                      .mutate({
		                      trans: trans,
		                      type: 'put',
		                      keys: resultKeys,
		                      values: resultObjs,
		                      updates: {
		                          keys: keys,
		                          changeSpecs: changeSpecs,
		                      },
		                  })
		                      .then(function (_a) {
		                      var numFailures = _a.numFailures, failures = _a.failures;
		                      if (numFailures === 0)
		                          return numEntries;
		                      for (var _i = 0, _b = Object.keys(failures); _i < _b.length; _i++) {
		                          var offset = _b[_i];
		                          var mappedOffset = offsetMap[Number(offset)];
		                          if (mappedOffset != null) {
		                              var failure = failures[offset];
		                              delete failures[offset];
		                              failures[mappedOffset] = failure;
		                          }
		                      }
		                      throw new BulkError("".concat(_this.name, ".bulkUpdate(): ").concat(numFailures, " of ").concat(numEntries, " operations failed"), failures);
		                  });
		              });
		          });
		      };
		      Table.prototype.bulkDelete = function (keys) {
		          var _this = this;
		          var numKeys = keys.length;
		          return this._trans('readwrite', function (trans) {
		              return _this.core
		                  .mutate({ trans: trans, type: 'delete', keys: keys })
		                  .then(function (res) { return builtInDeletionTrigger(_this, keys, res); });
		          }).then(function (_a) {
		              var numFailures = _a.numFailures, lastResult = _a.lastResult, failures = _a.failures;
		              if (numFailures === 0)
		                  return lastResult;
		              throw new BulkError("".concat(_this.name, ".bulkDelete(): ").concat(numFailures, " of ").concat(numKeys, " operations failed"), failures);
		          });
		      };
		      return Table;
		  }());

		  function Events(ctx) {
		      var evs = {};
		      var rv = function (eventName, subscriber) {
		          if (subscriber) {
		              var i = arguments.length, args = new Array(i - 1);
		              while (--i)
		                  args[i - 1] = arguments[i];
		              evs[eventName].subscribe.apply(null, args);
		              return ctx;
		          }
		          else if (typeof eventName === 'string') {
		              return evs[eventName];
		          }
		      };
		      rv.addEventType = add;
		      for (var i = 1, l = arguments.length; i < l; ++i) {
		          add(arguments[i]);
		      }
		      return rv;
		      function add(eventName, chainFunction, defaultFunction) {
		          if (typeof eventName === 'object')
		              return addConfiguredEvents(eventName);
		          if (!chainFunction)
		              chainFunction = reverseStoppableEventChain;
		          if (!defaultFunction)
		              defaultFunction = nop;
		          var context = {
		              subscribers: [],
		              fire: defaultFunction,
		              subscribe: function (cb) {
		                  if (context.subscribers.indexOf(cb) === -1) {
		                      context.subscribers.push(cb);
		                      context.fire = chainFunction(context.fire, cb);
		                  }
		              },
		              unsubscribe: function (cb) {
		                  context.subscribers = context.subscribers.filter(function (fn) {
		                      return fn !== cb;
		                  });
		                  context.fire = context.subscribers.reduce(chainFunction, defaultFunction);
		              },
		          };
		          evs[eventName] = rv[eventName] = context;
		          return context;
		      }
		      function addConfiguredEvents(cfg) {
		          keys(cfg).forEach(function (eventName) {
		              var args = cfg[eventName];
		              if (isArray(args)) {
		                  add(eventName, cfg[eventName][0], cfg[eventName][1]);
		              }
		              else if (args === 'asap') {
		                  var context = add(eventName, mirror, function fire() {
		                      var i = arguments.length, args = new Array(i);
		                      while (i--)
		                          args[i] = arguments[i];
		                      context.subscribers.forEach(function (fn) {
		                          asap$1(function fireEvent() {
		                              fn.apply(null, args);
		                          });
		                      });
		                  });
		              }
		              else
		                  throw new exceptions.InvalidArgument('Invalid event config');
		          });
		      }
		  }

		  function makeClassConstructor(prototype, constructor) {
		      derive(constructor).from({ prototype: prototype });
		      return constructor;
		  }

		  function createTableConstructor(db) {
		      return makeClassConstructor(Table.prototype, function Table(name, tableSchema, trans) {
		          this.db = db;
		          this._tx = trans;
		          this.name = name;
		          this.schema = tableSchema;
		          this.hook = db._allTables[name]
		              ? db._allTables[name].hook
		              : Events(null, {
		                  creating: [hookCreatingChain, nop],
		                  reading: [pureFunctionChain, mirror],
		                  updating: [hookUpdatingChain, nop],
		                  deleting: [hookDeletingChain, nop],
		              });
		      });
		  }

		  function isPlainKeyRange(ctx, ignoreLimitFilter) {
		      return (!(ctx.filter || ctx.algorithm || ctx.or) &&
		          (ignoreLimitFilter ? ctx.justLimit : !ctx.replayFilter));
		  }
		  function addFilter(ctx, fn) {
		      ctx.filter = combine(ctx.filter, fn);
		  }
		  function addReplayFilter(ctx, factory, isLimitFilter) {
		      var curr = ctx.replayFilter;
		      ctx.replayFilter = curr ? function () { return combine(curr(), factory()); } : factory;
		      ctx.justLimit = isLimitFilter && !curr;
		  }
		  function addMatchFilter(ctx, fn) {
		      ctx.isMatch = combine(ctx.isMatch, fn);
		  }
		  function getIndexOrStore(ctx, coreSchema) {
		      if (ctx.isPrimKey)
		          return coreSchema.primaryKey;
		      var index = coreSchema.getIndexByKeyPath(ctx.index);
		      if (!index)
		          throw new exceptions.Schema('KeyPath ' +
		              ctx.index +
		              ' on object store ' +
		              coreSchema.name +
		              ' is not indexed');
		      return index;
		  }
		  function openCursor(ctx, coreTable, trans) {
		      var index = getIndexOrStore(ctx, coreTable.schema);
		      return coreTable.openCursor({
		          trans: trans,
		          values: !ctx.keysOnly,
		          reverse: ctx.dir === 'prev',
		          unique: !!ctx.unique,
		          query: {
		              index: index,
		              range: ctx.range,
		          },
		      });
		  }
		  function iter(ctx, fn, coreTrans, coreTable) {
		      var filter = ctx.replayFilter
		          ? combine(ctx.filter, ctx.replayFilter())
		          : ctx.filter;
		      if (!ctx.or) {
		          return iterate(openCursor(ctx, coreTable, coreTrans), combine(ctx.algorithm, filter), fn, !ctx.keysOnly && ctx.valueMapper);
		      }
		      else {
		          var set_1 = {};
		          var union = function (item, cursor, advance) {
		              if (!filter ||
		                  filter(cursor, advance, function (result) { return cursor.stop(result); }, function (err) { return cursor.fail(err); })) {
		                  var primaryKey = cursor.primaryKey;
		                  var key = '' + primaryKey;
		                  if (key === '[object ArrayBuffer]')
		                      key = '' + new Uint8Array(primaryKey);
		                  if (!hasOwn(set_1, key)) {
		                      set_1[key] = true;
		                      fn(item, cursor, advance);
		                  }
		              }
		          };
		          return Promise.all([
		              ctx.or._iterate(union, coreTrans),
		              iterate(openCursor(ctx, coreTable, coreTrans), ctx.algorithm, union, !ctx.keysOnly && ctx.valueMapper),
		          ]);
		      }
		  }
		  function iterate(cursorPromise, filter, fn, valueMapper) {
		      var mappedFn = valueMapper ? function (x, c, a) { return fn(valueMapper(x), c, a); } : fn;
		      var wrappedFn = wrap(mappedFn);
		      return cursorPromise.then(function (cursor) {
		          if (cursor) {
		              return cursor.start(function () {
		                  var c = function () { return cursor.continue(); };
		                  if (!filter ||
		                      filter(cursor, function (advancer) { return (c = advancer); }, function (val) {
		                          cursor.stop(val);
		                          c = nop;
		                      }, function (e) {
		                          cursor.fail(e);
		                          c = nop;
		                      }))
		                      wrappedFn(cursor.value, cursor, function (advancer) { return (c = advancer); });
		                  c();
		              });
		          }
		      });
		  }

		  var Collection =  (function () {
		      function Collection() {
		      }
		      Collection.prototype._read = function (fn, cb) {
		          var ctx = this._ctx;
		          return ctx.error
		              ? ctx.table._trans(null, rejection.bind(null, ctx.error))
		              : ctx.table._trans('readonly', fn).then(cb);
		      };
		      Collection.prototype._write = function (fn) {
		          var ctx = this._ctx;
		          return ctx.error
		              ? ctx.table._trans(null, rejection.bind(null, ctx.error))
		              : ctx.table._trans('readwrite', fn, 'locked');
		      };
		      Collection.prototype._addAlgorithm = function (fn) {
		          var ctx = this._ctx;
		          ctx.algorithm = combine(ctx.algorithm, fn);
		      };
		      Collection.prototype._iterate = function (fn, coreTrans) {
		          return iter(this._ctx, fn, coreTrans, this._ctx.table.core);
		      };
		      Collection.prototype.clone = function (props) {
		          var rv = Object.create(this.constructor.prototype), ctx = Object.create(this._ctx);
		          if (props)
		              extend(ctx, props);
		          rv._ctx = ctx;
		          return rv;
		      };
		      Collection.prototype.raw = function () {
		          this._ctx.valueMapper = null;
		          return this;
		      };
		      Collection.prototype.each = function (fn) {
		          var ctx = this._ctx;
		          return this._read(function (trans) { return iter(ctx, fn, trans, ctx.table.core); });
		      };
		      Collection.prototype.count = function (cb) {
		          var _this = this;
		          return this._read(function (trans) {
		              var ctx = _this._ctx;
		              var coreTable = ctx.table.core;
		              if (isPlainKeyRange(ctx, true)) {
		                  return coreTable
		                      .count({
		                      trans: trans,
		                      query: {
		                          index: getIndexOrStore(ctx, coreTable.schema),
		                          range: ctx.range,
		                      },
		                  })
		                      .then(function (count) { return Math.min(count, ctx.limit); });
		              }
		              else {
		                  var count = 0;
		                  return iter(ctx, function () {
		                      ++count;
		                      return false;
		                  }, trans, coreTable).then(function () { return count; });
		              }
		          }).then(cb);
		      };
		      Collection.prototype.sortBy = function (keyPath, cb) {
		          var parts = keyPath.split('.').reverse(), lastPart = parts[0], lastIndex = parts.length - 1;
		          function getval(obj, i) {
		              if (i)
		                  return getval(obj[parts[i]], i - 1);
		              return obj[lastPart];
		          }
		          var order = this._ctx.dir === 'next' ? 1 : -1;
		          function sorter(a, b) {
		              var aVal = getval(a, lastIndex), bVal = getval(b, lastIndex);
		              return cmp(aVal, bVal) * order;
		          }
		          return this.toArray(function (a) {
		              return a.slice().sort(sorter);
		          }).then(cb);
		      };
		      Collection.prototype.toArray = function (cb) {
		          var _this = this;
		          return this._read(function (trans) {
		              var ctx = _this._ctx;
		              if (isPlainKeyRange(ctx, true) && ctx.limit > 0) {
		                  var valueMapper_1 = ctx.valueMapper;
		                  var index = getIndexOrStore(ctx, ctx.table.core.schema);
		                  return ctx.table.core
		                      .query({
		                      trans: trans,
		                      limit: ctx.limit,
		                      values: true,
		                      direction: ctx.dir === 'prev' ? 'prev' : undefined,
		                      query: {
		                          index: index,
		                          range: ctx.range,
		                      },
		                  })
		                      .then(function (_a) {
		                      var result = _a.result;
		                      return valueMapper_1 ? result.map(valueMapper_1) : result;
		                  });
		              }
		              else {
		                  var a_1 = [];
		                  return iter(ctx, function (item) { return a_1.push(item); }, trans, ctx.table.core).then(function () { return a_1; });
		              }
		          }, cb);
		      };
		      Collection.prototype.offset = function (offset) {
		          var ctx = this._ctx;
		          if (offset <= 0)
		              return this;
		          ctx.offset += offset;
		          if (isPlainKeyRange(ctx)) {
		              addReplayFilter(ctx, function () {
		                  var offsetLeft = offset;
		                  return function (cursor, advance) {
		                      if (offsetLeft === 0)
		                          return true;
		                      if (offsetLeft === 1) {
		                          --offsetLeft;
		                          return false;
		                      }
		                      advance(function () {
		                          cursor.advance(offsetLeft);
		                          offsetLeft = 0;
		                      });
		                      return false;
		                  };
		              });
		          }
		          else {
		              addReplayFilter(ctx, function () {
		                  var offsetLeft = offset;
		                  return function () { return --offsetLeft < 0; };
		              });
		          }
		          return this;
		      };
		      Collection.prototype.limit = function (numRows) {
		          this._ctx.limit = Math.min(this._ctx.limit, numRows);
		          addReplayFilter(this._ctx, function () {
		              var rowsLeft = numRows;
		              return function (cursor, advance, resolve) {
		                  if (--rowsLeft <= 0)
		                      advance(resolve);
		                  return rowsLeft >= 0;
		              };
		          }, true);
		          return this;
		      };
		      Collection.prototype.until = function (filterFunction, bIncludeStopEntry) {
		          addFilter(this._ctx, function (cursor, advance, resolve) {
		              if (filterFunction(cursor.value)) {
		                  advance(resolve);
		                  return bIncludeStopEntry;
		              }
		              else {
		                  return true;
		              }
		          });
		          return this;
		      };
		      Collection.prototype.first = function (cb) {
		          return this.limit(1)
		              .toArray(function (a) {
		              return a[0];
		          })
		              .then(cb);
		      };
		      Collection.prototype.last = function (cb) {
		          return this.reverse().first(cb);
		      };
		      Collection.prototype.filter = function (filterFunction) {
		          addFilter(this._ctx, function (cursor) {
		              return filterFunction(cursor.value);
		          });
		          addMatchFilter(this._ctx, filterFunction);
		          return this;
		      };
		      Collection.prototype.and = function (filter) {
		          return this.filter(filter);
		      };
		      Collection.prototype.or = function (indexName) {
		          return new this.db.WhereClause(this._ctx.table, indexName, this);
		      };
		      Collection.prototype.reverse = function () {
		          this._ctx.dir = this._ctx.dir === 'prev' ? 'next' : 'prev';
		          if (this._ondirectionchange)
		              this._ondirectionchange(this._ctx.dir);
		          return this;
		      };
		      Collection.prototype.desc = function () {
		          return this.reverse();
		      };
		      Collection.prototype.eachKey = function (cb) {
		          var ctx = this._ctx;
		          ctx.keysOnly = !ctx.isMatch;
		          return this.each(function (val, cursor) {
		              cb(cursor.key, cursor);
		          });
		      };
		      Collection.prototype.eachUniqueKey = function (cb) {
		          this._ctx.unique = 'unique';
		          return this.eachKey(cb);
		      };
		      Collection.prototype.eachPrimaryKey = function (cb) {
		          var ctx = this._ctx;
		          ctx.keysOnly = !ctx.isMatch;
		          return this.each(function (val, cursor) {
		              cb(cursor.primaryKey, cursor);
		          });
		      };
		      Collection.prototype.keys = function (cb) {
		          var ctx = this._ctx;
		          ctx.keysOnly = !ctx.isMatch;
		          var a = [];
		          return this.each(function (item, cursor) {
		              a.push(cursor.key);
		          })
		              .then(function () {
		              return a;
		          })
		              .then(cb);
		      };
		      Collection.prototype.primaryKeys = function (cb) {
		          var ctx = this._ctx;
		          if (isPlainKeyRange(ctx, true) && ctx.limit > 0) {
		              return this._read(function (trans) {
		                  var index = getIndexOrStore(ctx, ctx.table.core.schema);
		                  return ctx.table.core.query({
		                      trans: trans,
		                      values: false,
		                      limit: ctx.limit,
		                      direction: ctx.dir === 'prev' ? 'prev' : undefined,
		                      query: {
		                          index: index,
		                          range: ctx.range,
		                      },
		                  });
		              })
		                  .then(function (_a) {
		                  var result = _a.result;
		                  return result;
		              })
		                  .then(cb);
		          }
		          ctx.keysOnly = !ctx.isMatch;
		          var a = [];
		          return this.each(function (item, cursor) {
		              a.push(cursor.primaryKey);
		          })
		              .then(function () {
		              return a;
		          })
		              .then(cb);
		      };
		      Collection.prototype.uniqueKeys = function (cb) {
		          this._ctx.unique = 'unique';
		          return this.keys(cb);
		      };
		      Collection.prototype.firstKey = function (cb) {
		          return this.limit(1)
		              .keys(function (a) {
		              return a[0];
		          })
		              .then(cb);
		      };
		      Collection.prototype.lastKey = function (cb) {
		          return this.reverse().firstKey(cb);
		      };
		      Collection.prototype.distinct = function () {
		          var ctx = this._ctx, idx = ctx.index && ctx.table.schema.idxByName[ctx.index];
		          if (!idx || !idx.multi)
		              return this;
		          var set = {};
		          addFilter(this._ctx, function (cursor) {
		              var strKey = cursor.primaryKey.toString();
		              var found = hasOwn(set, strKey);
		              set[strKey] = true;
		              return !found;
		          });
		          return this;
		      };
		      Collection.prototype.modify = function (changes) {
		          var _this = this;
		          var ctx = this._ctx;
		          return this._write(function (trans) {
		              var modifyer;
		              if (typeof changes === 'function') {
		                  modifyer = changes;
		              }
		              else {
		                  modifyer = function (item) { return applyUpdateSpec(item, changes); };
		              }
		              var coreTable = ctx.table.core;
		              var _a = coreTable.schema.primaryKey, outbound = _a.outbound, extractKey = _a.extractKey;
		              var limit = 200;
		              var modifyChunkSize = _this.db._options.modifyChunkSize;
		              if (modifyChunkSize) {
		                  if (typeof modifyChunkSize == 'object') {
		                      limit =
		                          modifyChunkSize[coreTable.name] || modifyChunkSize['*'] || 200;
		                  }
		                  else {
		                      limit = modifyChunkSize;
		                  }
		              }
		              var totalFailures = [];
		              var successCount = 0;
		              var failedKeys = [];
		              var applyMutateResult = function (expectedCount, res) {
		                  var failures = res.failures, numFailures = res.numFailures;
		                  successCount += expectedCount - numFailures;
		                  for (var _i = 0, _a = keys(failures); _i < _a.length; _i++) {
		                      var pos = _a[_i];
		                      totalFailures.push(failures[pos]);
		                  }
		              };
		              var isUnconditionalDelete = changes === deleteCallback;
		              return _this.clone()
		                  .primaryKeys()
		                  .then(function (keys) {
		                  var criteria = isPlainKeyRange(ctx) &&
		                      ctx.limit === Infinity &&
		                      (typeof changes !== 'function' || isUnconditionalDelete) && {
		                      index: ctx.index,
		                      range: ctx.range,
		                  };
		                  var nextChunk = function (offset) {
		                      var count = Math.min(limit, keys.length - offset);
		                      var keysInChunk = keys.slice(offset, offset + count);
		                      return (isUnconditionalDelete
		                          ? Promise.resolve([])
		                          : coreTable.getMany({
		                              trans: trans,
		                              keys: keysInChunk,
		                              cache: 'immutable',
		                          })).then(function (values) {
		                          var addValues = [];
		                          var putValues = [];
		                          var putKeys = outbound ? [] : null;
		                          var deleteKeys = isUnconditionalDelete ? keysInChunk : [];
		                          if (!isUnconditionalDelete)
		                              for (var i = 0; i < count; ++i) {
		                                  var origValue = values[i];
		                                  var ctx_1 = {
		                                      value: deepClone(origValue),
		                                      primKey: keys[offset + i],
		                                  };
		                                  if (modifyer.call(ctx_1, ctx_1.value, ctx_1) !== false) {
		                                      if (ctx_1.value == null) {
		                                          deleteKeys.push(keys[offset + i]);
		                                      }
		                                      else if (!outbound &&
		                                          cmp(extractKey(origValue), extractKey(ctx_1.value)) !== 0) {
		                                          deleteKeys.push(keys[offset + i]);
		                                          addValues.push(ctx_1.value);
		                                      }
		                                      else {
		                                          putValues.push(ctx_1.value);
		                                          if (outbound)
		                                              putKeys.push(keys[offset + i]);
		                                      }
		                                  }
		                              }
		                          return Promise.resolve(addValues.length > 0 &&
		                              coreTable
		                                  .mutate({ trans: trans, type: 'add', values: addValues })
		                                  .then(function (res) {
		                                  for (var pos in res.failures) {
		                                      deleteKeys.splice(parseInt(pos), 1);
		                                  }
		                                  applyMutateResult(addValues.length, res);
		                              }))
		                              .then(function () {
		                              return (putValues.length > 0 ||
		                                  (criteria && typeof changes === 'object')) &&
		                                  coreTable
		                                      .mutate({
		                                      trans: trans,
		                                      type: 'put',
		                                      keys: putKeys,
		                                      values: putValues,
		                                      criteria: criteria,
		                                      changeSpec: typeof changes !== 'function' && changes,
		                                      isAdditionalChunk: offset > 0,
		                                  })
		                                      .then(function (res) { return applyMutateResult(putValues.length, res); });
		                          })
		                              .then(function () {
		                              return (deleteKeys.length > 0 ||
		                                  (criteria && isUnconditionalDelete)) &&
		                                  coreTable
		                                      .mutate({
		                                      trans: trans,
		                                      type: 'delete',
		                                      keys: deleteKeys,
		                                      criteria: criteria,
		                                      isAdditionalChunk: offset > 0,
		                                  })
		                                      .then(function (res) {
		                                      return builtInDeletionTrigger(ctx.table, deleteKeys, res);
		                                  })
		                                      .then(function (res) { return applyMutateResult(deleteKeys.length, res); });
		                          })
		                              .then(function () {
		                              return (keys.length > offset + count && nextChunk(offset + limit));
		                          });
		                      });
		                  };
		                  return nextChunk(0).then(function () {
		                      if (totalFailures.length > 0)
		                          throw new ModifyError('Error modifying one or more objects', totalFailures, successCount, failedKeys);
		                      return keys.length;
		                  });
		              });
		          });
		      };
		      Collection.prototype.delete = function () {
		          var ctx = this._ctx, range = ctx.range;
		          if (isPlainKeyRange(ctx) &&
		              !ctx.table.schema.yProps &&
		              (ctx.isPrimKey || range.type === 3 ))
		           {
		              return this._write(function (trans) {
		                  var primaryKey = ctx.table.core.schema.primaryKey;
		                  var coreRange = range;
		                  return ctx.table.core
		                      .count({ trans: trans, query: { index: primaryKey, range: coreRange } })
		                      .then(function (count) {
		                      return ctx.table.core
		                          .mutate({ trans: trans, type: 'deleteRange', range: coreRange })
		                          .then(function (_a) {
		                          var failures = _a.failures, numFailures = _a.numFailures;
		                          if (numFailures)
		                              throw new ModifyError('Could not delete some values', Object.keys(failures).map(function (pos) { return failures[pos]; }), count - numFailures);
		                          return count - numFailures;
		                      });
		                  });
		              });
		          }
		          return this.modify(deleteCallback);
		      };
		      return Collection;
		  }());
		  var deleteCallback = function (value, ctx) { return (ctx.value = null); };

		  function createCollectionConstructor(db) {
		      return makeClassConstructor(Collection.prototype, function Collection(whereClause, keyRangeGenerator) {
		          this.db = db;
		          var keyRange = AnyRange, error = null;
		          if (keyRangeGenerator)
		              try {
		                  keyRange = keyRangeGenerator();
		              }
		              catch (ex) {
		                  error = ex;
		              }
		          var whereCtx = whereClause._ctx;
		          var table = whereCtx.table;
		          var readingHook = table.hook.reading.fire;
		          this._ctx = {
		              table: table,
		              index: whereCtx.index,
		              isPrimKey: !whereCtx.index ||
		                  (table.schema.primKey.keyPath &&
		                      whereCtx.index === table.schema.primKey.name),
		              range: keyRange,
		              keysOnly: false,
		              dir: 'next',
		              unique: '',
		              algorithm: null,
		              filter: null,
		              replayFilter: null,
		              justLimit: true,
		              isMatch: null,
		              offset: 0,
		              limit: Infinity,
		              error: error,
		              or: whereCtx.or,
		              valueMapper: readingHook !== mirror ? readingHook : null,
		          };
		      });
		  }

		  function simpleCompare(a, b) {
		      return a < b ? -1 : a === b ? 0 : 1;
		  }
		  function simpleCompareReverse(a, b) {
		      return a > b ? -1 : a === b ? 0 : 1;
		  }

		  function fail(collectionOrWhereClause, err, T) {
		      var collection = collectionOrWhereClause instanceof WhereClause
		          ? new collectionOrWhereClause.Collection(collectionOrWhereClause)
		          : collectionOrWhereClause;
		      collection._ctx.error = T ? new T(err) : new TypeError(err);
		      return collection;
		  }
		  function emptyCollection(whereClause) {
		      return new whereClause.Collection(whereClause, function () { return rangeEqual(''); }).limit(0);
		  }
		  function upperFactory(dir) {
		      return dir === 'next'
		          ? function (s) { return s.toUpperCase(); }
		          : function (s) { return s.toLowerCase(); };
		  }
		  function lowerFactory(dir) {
		      return dir === 'next'
		          ? function (s) { return s.toLowerCase(); }
		          : function (s) { return s.toUpperCase(); };
		  }
		  function nextCasing(key, lowerKey, upperNeedle, lowerNeedle, cmp, dir) {
		      var length = Math.min(key.length, lowerNeedle.length);
		      var llp = -1;
		      for (var i = 0; i < length; ++i) {
		          var lwrKeyChar = lowerKey[i];
		          if (lwrKeyChar !== lowerNeedle[i]) {
		              if (cmp(key[i], upperNeedle[i]) < 0)
		                  return key.substr(0, i) + upperNeedle[i] + upperNeedle.substr(i + 1);
		              if (cmp(key[i], lowerNeedle[i]) < 0)
		                  return key.substr(0, i) + lowerNeedle[i] + upperNeedle.substr(i + 1);
		              if (llp >= 0)
		                  return key.substr(0, llp) + lowerKey[llp] + upperNeedle.substr(llp + 1);
		              return null;
		          }
		          if (cmp(key[i], lwrKeyChar) < 0)
		              llp = i;
		      }
		      if (length < lowerNeedle.length && dir === 'next')
		          return key + upperNeedle.substr(key.length);
		      if (length < key.length && dir === 'prev')
		          return key.substr(0, upperNeedle.length);
		      return llp < 0
		          ? null
		          : key.substr(0, llp) + lowerNeedle[llp] + upperNeedle.substr(llp + 1);
		  }
		  function addIgnoreCaseAlgorithm(whereClause, match, needles, suffix) {
		      var upper, lower, compare, upperNeedles, lowerNeedles, direction, nextKeySuffix, needlesLen = needles.length;
		      if (!needles.every(function (s) { return typeof s === 'string'; })) {
		          return fail(whereClause, STRING_EXPECTED);
		      }
		      function initDirection(dir) {
		          upper = upperFactory(dir);
		          lower = lowerFactory(dir);
		          compare = dir === 'next' ? simpleCompare : simpleCompareReverse;
		          var needleBounds = needles
		              .map(function (needle) {
		              return { lower: lower(needle), upper: upper(needle) };
		          })
		              .sort(function (a, b) {
		              return compare(a.lower, b.lower);
		          });
		          upperNeedles = needleBounds.map(function (nb) {
		              return nb.upper;
		          });
		          lowerNeedles = needleBounds.map(function (nb) {
		              return nb.lower;
		          });
		          direction = dir;
		          nextKeySuffix = dir === 'next' ? '' : suffix;
		      }
		      initDirection('next');
		      var c = new whereClause.Collection(whereClause, function () {
		          return createRange(upperNeedles[0], lowerNeedles[needlesLen - 1] + suffix);
		      });
		      c._ondirectionchange = function (direction) {
		          initDirection(direction);
		      };
		      var firstPossibleNeedle = 0;
		      c._addAlgorithm(function (cursor, advance, resolve) {
		          var key = cursor.key;
		          if (typeof key !== 'string')
		              return false;
		          var lowerKey = lower(key);
		          if (match(lowerKey, lowerNeedles, firstPossibleNeedle)) {
		              return true;
		          }
		          else {
		              var lowestPossibleCasing = null;
		              for (var i = firstPossibleNeedle; i < needlesLen; ++i) {
		                  var casing = nextCasing(key, lowerKey, upperNeedles[i], lowerNeedles[i], compare, direction);
		                  if (casing === null && lowestPossibleCasing === null)
		                      firstPossibleNeedle = i + 1;
		                  else if (lowestPossibleCasing === null ||
		                      compare(lowestPossibleCasing, casing) > 0) {
		                      lowestPossibleCasing = casing;
		                  }
		              }
		              if (lowestPossibleCasing !== null) {
		                  advance(function () {
		                      cursor.continue(lowestPossibleCasing + nextKeySuffix);
		                  });
		              }
		              else {
		                  advance(resolve);
		              }
		              return false;
		          }
		      });
		      return c;
		  }
		  function createRange(lower, upper, lowerOpen, upperOpen) {
		      return {
		          type: 2 ,
		          lower: lower,
		          upper: upper,
		          lowerOpen: lowerOpen,
		          upperOpen: upperOpen,
		      };
		  }
		  function rangeEqual(value) {
		      return {
		          type: 1 ,
		          lower: value,
		          upper: value,
		      };
		  }

		  var WhereClause =  (function () {
		      function WhereClause() {
		      }
		      Object.defineProperty(WhereClause.prototype, "Collection", {
		          get: function () {
		              return this._ctx.table.db.Collection;
		          },
		          enumerable: false,
		          configurable: true
		      });
		      WhereClause.prototype.between = function (lower, upper, includeLower, includeUpper) {
		          includeLower = includeLower !== false;
		          includeUpper = includeUpper === true;
		          try {
		              if (this._cmp(lower, upper) > 0 ||
		                  (this._cmp(lower, upper) === 0 &&
		                      (includeLower || includeUpper) &&
		                      !(includeLower && includeUpper)))
		                  return emptyCollection(this);
		              return new this.Collection(this, function () {
		                  return createRange(lower, upper, !includeLower, !includeUpper);
		              });
		          }
		          catch (e) {
		              return fail(this, INVALID_KEY_ARGUMENT);
		          }
		      };
		      WhereClause.prototype.equals = function (value) {
		          if (value == null)
		              return fail(this, INVALID_KEY_ARGUMENT);
		          return new this.Collection(this, function () { return rangeEqual(value); });
		      };
		      WhereClause.prototype.above = function (value) {
		          if (value == null)
		              return fail(this, INVALID_KEY_ARGUMENT);
		          return new this.Collection(this, function () { return createRange(value, undefined, true); });
		      };
		      WhereClause.prototype.aboveOrEqual = function (value) {
		          if (value == null)
		              return fail(this, INVALID_KEY_ARGUMENT);
		          return new this.Collection(this, function () {
		              return createRange(value, undefined, false);
		          });
		      };
		      WhereClause.prototype.below = function (value) {
		          if (value == null)
		              return fail(this, INVALID_KEY_ARGUMENT);
		          return new this.Collection(this, function () {
		              return createRange(undefined, value, false, true);
		          });
		      };
		      WhereClause.prototype.belowOrEqual = function (value) {
		          if (value == null)
		              return fail(this, INVALID_KEY_ARGUMENT);
		          return new this.Collection(this, function () { return createRange(undefined, value); });
		      };
		      WhereClause.prototype.startsWith = function (str) {
		          if (typeof str !== 'string')
		              return fail(this, STRING_EXPECTED);
		          return this.between(str, str + maxString, true, true);
		      };
		      WhereClause.prototype.startsWithIgnoreCase = function (str) {
		          if (str === '')
		              return this.startsWith(str);
		          return addIgnoreCaseAlgorithm(this, function (x, a) { return x.indexOf(a[0]) === 0; }, [str], maxString);
		      };
		      WhereClause.prototype.equalsIgnoreCase = function (str) {
		          return addIgnoreCaseAlgorithm(this, function (x, a) { return x === a[0]; }, [str], '');
		      };
		      WhereClause.prototype.anyOfIgnoreCase = function () {
		          var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
		          if (set.length === 0)
		              return emptyCollection(this);
		          return addIgnoreCaseAlgorithm(this, function (x, a) { return a.indexOf(x) !== -1; }, set, '');
		      };
		      WhereClause.prototype.startsWithAnyOfIgnoreCase = function () {
		          var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
		          if (set.length === 0)
		              return emptyCollection(this);
		          return addIgnoreCaseAlgorithm(this, function (x, a) { return a.some(function (n) { return x.indexOf(n) === 0; }); }, set, maxString);
		      };
		      WhereClause.prototype.anyOf = function () {
		          var _this = this;
		          var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
		          var compare = this._cmp;
		          try {
		              set.sort(compare);
		          }
		          catch (e) {
		              return fail(this, INVALID_KEY_ARGUMENT);
		          }
		          if (set.length === 0)
		              return emptyCollection(this);
		          var c = new this.Collection(this, function () {
		              return createRange(set[0], set[set.length - 1]);
		          });
		          c._ondirectionchange = function (direction) {
		              compare = direction === 'next' ? _this._ascending : _this._descending;
		              set.sort(compare);
		          };
		          var i = 0;
		          c._addAlgorithm(function (cursor, advance, resolve) {
		              var key = cursor.key;
		              while (compare(key, set[i]) > 0) {
		                  ++i;
		                  if (i === set.length) {
		                      advance(resolve);
		                      return false;
		                  }
		              }
		              if (compare(key, set[i]) === 0) {
		                  return true;
		              }
		              else {
		                  advance(function () {
		                      cursor.continue(set[i]);
		                  });
		                  return false;
		              }
		          });
		          return c;
		      };
		      WhereClause.prototype.notEqual = function (value) {
		          return this.inAnyRange([
		              [minKey, value],
		              [value, this.db._maxKey],
		          ], { includeLowers: false, includeUppers: false });
		      };
		      WhereClause.prototype.noneOf = function () {
		          var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
		          if (set.length === 0)
		              return new this.Collection(this);
		          try {
		              set.sort(this._ascending);
		          }
		          catch (e) {
		              return fail(this, INVALID_KEY_ARGUMENT);
		          }
		          var ranges = set.reduce(function (res, val) {
		              return res ? res.concat([[res[res.length - 1][1], val]]) : [[minKey, val]];
		          }, null);
		          ranges.push([set[set.length - 1], this.db._maxKey]);
		          return this.inAnyRange(ranges, {
		              includeLowers: false,
		              includeUppers: false,
		          });
		      };
		      WhereClause.prototype.inAnyRange = function (ranges, options) {
		          var _this = this;
		          var cmp = this._cmp, ascending = this._ascending, descending = this._descending, min = this._min, max = this._max;
		          if (ranges.length === 0)
		              return emptyCollection(this);
		          if (!ranges.every(function (range) {
		              return range[0] !== undefined &&
		                  range[1] !== undefined &&
		                  ascending(range[0], range[1]) <= 0;
		          })) {
		              return fail(this, 'First argument to inAnyRange() must be an Array of two-value Arrays [lower,upper] where upper must not be lower than lower', exceptions.InvalidArgument);
		          }
		          var includeLowers = !options || options.includeLowers !== false;
		          var includeUppers = options && options.includeUppers === true;
		          function addRange(ranges, newRange) {
		              var i = 0, l = ranges.length;
		              for (; i < l; ++i) {
		                  var range = ranges[i];
		                  if (cmp(newRange[0], range[1]) < 0 && cmp(newRange[1], range[0]) > 0) {
		                      range[0] = min(range[0], newRange[0]);
		                      range[1] = max(range[1], newRange[1]);
		                      break;
		                  }
		              }
		              if (i === l)
		                  ranges.push(newRange);
		              return ranges;
		          }
		          var sortDirection = ascending;
		          function rangeSorter(a, b) {
		              return sortDirection(a[0], b[0]);
		          }
		          var set;
		          try {
		              set = ranges.reduce(addRange, []);
		              set.sort(rangeSorter);
		          }
		          catch (ex) {
		              return fail(this, INVALID_KEY_ARGUMENT);
		          }
		          var rangePos = 0;
		          var keyIsBeyondCurrentEntry = includeUppers
		              ? function (key) { return ascending(key, set[rangePos][1]) > 0; }
		              : function (key) { return ascending(key, set[rangePos][1]) >= 0; };
		          var keyIsBeforeCurrentEntry = includeLowers
		              ? function (key) { return descending(key, set[rangePos][0]) > 0; }
		              : function (key) { return descending(key, set[rangePos][0]) >= 0; };
		          function keyWithinCurrentRange(key) {
		              return !keyIsBeyondCurrentEntry(key) && !keyIsBeforeCurrentEntry(key);
		          }
		          var checkKey = keyIsBeyondCurrentEntry;
		          var c = new this.Collection(this, function () {
		              return createRange(set[0][0], set[set.length - 1][1], !includeLowers, !includeUppers);
		          });
		          c._ondirectionchange = function (direction) {
		              if (direction === 'next') {
		                  checkKey = keyIsBeyondCurrentEntry;
		                  sortDirection = ascending;
		              }
		              else {
		                  checkKey = keyIsBeforeCurrentEntry;
		                  sortDirection = descending;
		              }
		              set.sort(rangeSorter);
		          };
		          c._addAlgorithm(function (cursor, advance, resolve) {
		              var key = cursor.key;
		              while (checkKey(key)) {
		                  ++rangePos;
		                  if (rangePos === set.length) {
		                      advance(resolve);
		                      return false;
		                  }
		              }
		              if (keyWithinCurrentRange(key)) {
		                  return true;
		              }
		              else if (_this._cmp(key, set[rangePos][1]) === 0 ||
		                  _this._cmp(key, set[rangePos][0]) === 0) {
		                  return false;
		              }
		              else {
		                  advance(function () {
		                      if (sortDirection === ascending)
		                          cursor.continue(set[rangePos][0]);
		                      else
		                          cursor.continue(set[rangePos][1]);
		                  });
		                  return false;
		              }
		          });
		          return c;
		      };
		      WhereClause.prototype.startsWithAnyOf = function () {
		          var set = getArrayOf.apply(NO_CHAR_ARRAY, arguments);
		          if (!set.every(function (s) { return typeof s === 'string'; })) {
		              return fail(this, 'startsWithAnyOf() only works with strings');
		          }
		          if (set.length === 0)
		              return emptyCollection(this);
		          return this.inAnyRange(set.map(function (str) { return [str, str + maxString]; }));
		      };
		      return WhereClause;
		  }());

		  function createWhereClauseConstructor(db) {
		      return makeClassConstructor(WhereClause.prototype, function WhereClause(table, index, orCollection) {
		          this.db = db;
		          this._ctx = {
		              table: table,
		              index: index === ':id' ? null : index,
		              or: orCollection,
		          };
		          this._cmp = this._ascending = cmp;
		          this._descending = function (a, b) { return cmp(b, a); };
		          this._max = function (a, b) { return (cmp(a, b) > 0 ? a : b); };
		          this._min = function (a, b) { return (cmp(a, b) < 0 ? a : b); };
		          this._IDBKeyRange = db._deps.IDBKeyRange;
		          if (!this._IDBKeyRange)
		              throw new exceptions.MissingAPI();
		      });
		  }

		  function eventRejectHandler(reject) {
		      return wrap(function (event) {
		          preventDefault(event);
		          reject(event.target.error);
		          return false;
		      });
		  }
		  function preventDefault(event) {
		      if (event.stopPropagation)
		          event.stopPropagation();
		      if (event.preventDefault)
		          event.preventDefault();
		  }

		  var DEXIE_STORAGE_MUTATED_EVENT_NAME = 'storagemutated';
		  var STORAGE_MUTATED_DOM_EVENT_NAME = 'x-storagemutated-1';
		  var globalEvents = Events(null, DEXIE_STORAGE_MUTATED_EVENT_NAME);

		  var Transaction =  (function () {
		      function Transaction() {
		      }
		      Transaction.prototype._lock = function () {
		          assert(!PSD.global);
		          ++this._reculock;
		          if (this._reculock === 1 && !PSD.global)
		              PSD.lockOwnerFor = this;
		          return this;
		      };
		      Transaction.prototype._unlock = function () {
		          assert(!PSD.global);
		          if (--this._reculock === 0) {
		              if (!PSD.global)
		                  PSD.lockOwnerFor = null;
		              while (this._blockedFuncs.length > 0 && !this._locked()) {
		                  var fnAndPSD = this._blockedFuncs.shift();
		                  try {
		                      usePSD(fnAndPSD[1], fnAndPSD[0]);
		                  }
		                  catch (e) { }
		              }
		          }
		          return this;
		      };
		      Transaction.prototype._locked = function () {
		          return this._reculock && PSD.lockOwnerFor !== this;
		      };
		      Transaction.prototype.create = function (idbtrans) {
		          var _this = this;
		          if (!this.mode)
		              return this;
		          var idbdb = this.db.idbdb;
		          var dbOpenError = this.db._state.dbOpenError;
		          assert(!this.idbtrans);
		          if (!idbtrans && !idbdb) {
		              switch (dbOpenError && dbOpenError.name) {
		                  case 'DatabaseClosedError':
		                      throw new exceptions.DatabaseClosed(dbOpenError);
		                  case 'MissingAPIError':
		                      throw new exceptions.MissingAPI(dbOpenError.message, dbOpenError);
		                  default:
		                      throw new exceptions.OpenFailed(dbOpenError);
		              }
		          }
		          if (!this.active)
		              throw new exceptions.TransactionInactive();
		          assert(this._completion._state === null);
		          idbtrans = this.idbtrans =
		              idbtrans ||
		                  (this.db.core
		                      ? this.db.core.transaction(this.storeNames, this.mode, { durability: this.chromeTransactionDurability })
		                      : idbdb.transaction(this.storeNames, this.mode, {
		                          durability: this.chromeTransactionDurability,
		                      }));
		          idbtrans.onerror = wrap(function (ev) {
		              preventDefault(ev);
		              _this._reject(idbtrans.error);
		          });
		          idbtrans.onabort = wrap(function (ev) {
		              preventDefault(ev);
		              _this.active && _this._reject(new exceptions.Abort(idbtrans.error));
		              _this.active = false;
		              _this.on('abort').fire(ev);
		          });
		          idbtrans.oncomplete = wrap(function () {
		              _this.active = false;
		              _this._resolve();
		              if ('mutatedParts' in idbtrans) {
		                  globalEvents.storagemutated.fire(idbtrans['mutatedParts']);
		              }
		          });
		          return this;
		      };
		      Transaction.prototype._promise = function (mode, fn, bWriteLock) {
		          var _this = this;
		          if (mode === 'readwrite' && this.mode !== 'readwrite')
		              return rejection(new exceptions.ReadOnly('Transaction is readonly'));
		          if (!this.active)
		              return rejection(new exceptions.TransactionInactive());
		          if (this._locked()) {
		              return new DexiePromise(function (resolve, reject) {
		                  _this._blockedFuncs.push([
		                      function () {
		                          _this._promise(mode, fn, bWriteLock).then(resolve, reject);
		                      },
		                      PSD,
		                  ]);
		              });
		          }
		          else if (bWriteLock) {
		              return newScope(function () {
		                  var p = new DexiePromise(function (resolve, reject) {
		                      _this._lock();
		                      var rv = fn(resolve, reject, _this);
		                      if (rv && rv.then)
		                          rv.then(resolve, reject);
		                  });
		                  p.finally(function () { return _this._unlock(); });
		                  p._lib = true;
		                  return p;
		              });
		          }
		          else {
		              var p = new DexiePromise(function (resolve, reject) {
		                  var rv = fn(resolve, reject, _this);
		                  if (rv && rv.then)
		                      rv.then(resolve, reject);
		              });
		              p._lib = true;
		              return p;
		          }
		      };
		      Transaction.prototype._root = function () {
		          return this.parent ? this.parent._root() : this;
		      };
		      Transaction.prototype.waitFor = function (promiseLike) {
		          var root = this._root();
		          var promise = DexiePromise.resolve(promiseLike);
		          if (root._waitingFor) {
		              root._waitingFor = root._waitingFor.then(function () { return promise; });
		          }
		          else {
		              root._waitingFor = promise;
		              root._waitingQueue = [];
		              var store = root.idbtrans.objectStore(root.storeNames[0]);
		              (function spin() {
		                  ++root._spinCount;
		                  while (root._waitingQueue.length)
		                      root._waitingQueue.shift()();
		                  if (root._waitingFor)
		                      store.get(-Infinity).onsuccess = spin;
		              })();
		          }
		          var currentWaitPromise = root._waitingFor;
		          return new DexiePromise(function (resolve, reject) {
		              promise
		                  .then(function (res) { return root._waitingQueue.push(wrap(resolve.bind(null, res))); }, function (err) { return root._waitingQueue.push(wrap(reject.bind(null, err))); })
		                  .finally(function () {
		                  if (root._waitingFor === currentWaitPromise) {
		                      root._waitingFor = null;
		                  }
		              });
		          });
		      };
		      Transaction.prototype.abort = function () {
		          if (this.active) {
		              this.active = false;
		              if (this.idbtrans)
		                  this.idbtrans.abort();
		              this._reject(new exceptions.Abort());
		          }
		      };
		      Transaction.prototype.table = function (tableName) {
		          var memoizedTables = this._memoizedTables || (this._memoizedTables = {});
		          if (hasOwn(memoizedTables, tableName))
		              return memoizedTables[tableName];
		          var tableSchema = this.schema[tableName];
		          if (!tableSchema) {
		              throw new exceptions.NotFound('Table ' + tableName + ' not part of transaction');
		          }
		          var transactionBoundTable = new this.db.Table(tableName, tableSchema, this);
		          transactionBoundTable.core = this.db.core.table(tableName);
		          memoizedTables[tableName] = transactionBoundTable;
		          return transactionBoundTable;
		      };
		      return Transaction;
		  }());

		  function createTransactionConstructor(db) {
		      return makeClassConstructor(Transaction.prototype, function Transaction(mode, storeNames, dbschema, chromeTransactionDurability, parent) {
		          var _this = this;
		          if (mode !== 'readonly')
		              storeNames.forEach(function (storeName) {
		                  var _a;
		                  var yProps = (_a = dbschema[storeName]) === null || _a === void 0 ? void 0 : _a.yProps;
		                  if (yProps)
		                      storeNames = storeNames.concat(yProps.map(function (p) { return p.updatesTable; }));
		              });
		          this.db = db;
		          this.mode = mode;
		          this.storeNames = storeNames;
		          this.schema = dbschema;
		          this.chromeTransactionDurability = chromeTransactionDurability;
		          this.idbtrans = null;
		          this.on = Events(this, 'complete', 'error', 'abort');
		          this.parent = parent || null;
		          this.active = true;
		          this._reculock = 0;
		          this._blockedFuncs = [];
		          this._resolve = null;
		          this._reject = null;
		          this._waitingFor = null;
		          this._waitingQueue = null;
		          this._spinCount = 0;
		          this._completion = new DexiePromise(function (resolve, reject) {
		              _this._resolve = resolve;
		              _this._reject = reject;
		          });
		          this._completion.then(function () {
		              _this.active = false;
		              _this.on.complete.fire();
		          }, function (e) {
		              var wasActive = _this.active;
		              _this.active = false;
		              _this.on.error.fire(e);
		              _this.parent
		                  ? _this.parent._reject(e)
		                  : wasActive && _this.idbtrans && _this.idbtrans.abort();
		              return rejection(e);
		          });
		      });
		  }

		  function createIndexSpec(name, keyPath, unique, multi, auto, compound, isPrimKey, type) {
		      return {
		          name: name,
		          keyPath: keyPath,
		          unique: unique,
		          multi: multi,
		          auto: auto,
		          compound: compound,
		          src: (unique && !isPrimKey ? '&' : '') +
		              (multi ? '*' : '') +
		              (auto ? '++' : '') +
		              nameFromKeyPath(keyPath),
		          type: type,
		      };
		  }
		  function nameFromKeyPath(keyPath) {
		      return typeof keyPath === 'string'
		          ? keyPath
		          : keyPath
		              ? '[' + [].join.call(keyPath, '+') + ']'
		              : '';
		  }

		  function createTableSchema(name, primKey, indexes) {
		      return {
		          name: name,
		          primKey: primKey,
		          indexes: indexes,
		          mappedClass: null,
		          idxByName: arrayToObject(indexes, function (index) { return [index.name, index]; }),
		      };
		  }

		  function safariMultiStoreFix(storeNames) {
		      return storeNames.length === 1 ? storeNames[0] : storeNames;
		  }
		  var getMaxKey = function (IdbKeyRange) {
		      try {
		          IdbKeyRange.only([[]]);
		          getMaxKey = function () { return [[]]; };
		          return [[]];
		      }
		      catch (e) {
		          getMaxKey = function () { return maxString; };
		          return maxString;
		      }
		  };

		  function getKeyExtractor(keyPath) {
		      if (keyPath == null) {
		          return function () { return undefined; };
		      }
		      else if (typeof keyPath === 'string') {
		          return getSinglePathKeyExtractor(keyPath);
		      }
		      else {
		          return function (obj) { return getByKeyPath(obj, keyPath); };
		      }
		  }
		  function getSinglePathKeyExtractor(keyPath) {
		      var split = keyPath.split('.');
		      if (split.length === 1) {
		          return function (obj) { return obj[keyPath]; };
		      }
		      else {
		          return function (obj) { return getByKeyPath(obj, keyPath); };
		      }
		  }

		  function arrayify(arrayLike) {
		      return [].slice.call(arrayLike);
		  }
		  var _id_counter = 0;
		  function getKeyPathAlias(keyPath) {
		      return keyPath == null
		          ? ':id'
		          : typeof keyPath === 'string'
		              ? keyPath
		              : "[".concat(keyPath.join('+'), "]");
		  }
		  function createDBCore(db, IdbKeyRange, tmpTrans) {
		      function extractSchema(db, trans) {
		          var tables = arrayify(db.objectStoreNames);
		          var tempStore = tables.length > 0 ? trans.objectStore(tables[0]) : {};
		          return {
		              schema: {
		                  name: db.name,
		                  tables: tables
		                      .map(function (table) { return trans.objectStore(table); })
		                      .map(function (store) {
		                      var keyPath = store.keyPath, autoIncrement = store.autoIncrement;
		                      var compound = isArray(keyPath);
		                      var outbound = keyPath == null;
		                      var indexByKeyPath = {};
		                      var result = {
		                          name: store.name,
		                          primaryKey: {
		                              name: null,
		                              isPrimaryKey: true,
		                              outbound: outbound,
		                              compound: compound,
		                              keyPath: keyPath,
		                              autoIncrement: autoIncrement,
		                              unique: true,
		                              extractKey: getKeyExtractor(keyPath),
		                          },
		                          indexes: arrayify(store.indexNames)
		                              .map(function (indexName) { return store.index(indexName); })
		                              .map(function (index) {
		                              var name = index.name, unique = index.unique, multiEntry = index.multiEntry, keyPath = index.keyPath;
		                              var compound = isArray(keyPath);
		                              var result = {
		                                  name: name,
		                                  compound: compound,
		                                  keyPath: keyPath,
		                                  unique: unique,
		                                  multiEntry: multiEntry,
		                                  extractKey: getKeyExtractor(keyPath),
		                              };
		                              indexByKeyPath[getKeyPathAlias(keyPath)] = result;
		                              return result;
		                          }),
		                          getIndexByKeyPath: function (keyPath) {
		                              return indexByKeyPath[getKeyPathAlias(keyPath)];
		                          },
		                      };
		                      indexByKeyPath[':id'] = result.primaryKey;
		                      if (keyPath != null) {
		                          indexByKeyPath[getKeyPathAlias(keyPath)] = result.primaryKey;
		                      }
		                      return result;
		                  }),
		              },
		              hasGetAll: tables.length > 0 &&
		                  'getAll' in tempStore &&
		                  !(typeof navigator !== 'undefined' &&
		                      /Safari/.test(navigator.userAgent) &&
		                      !/(Chrome\/|Edge\/)/.test(navigator.userAgent) &&
		                      [].concat(navigator.userAgent.match(/Safari\/(\d*)/))[1] < 604),
		              hasIdb3Features: 'getAllRecords' in tempStore,
		          };
		      }
		      function makeIDBKeyRange(range) {
		          if (range.type === 3 )
		              return null;
		          if (range.type === 4 )
		              throw new Error('Cannot convert never type to IDBKeyRange');
		          var lower = range.lower, upper = range.upper, lowerOpen = range.lowerOpen, upperOpen = range.upperOpen;
		          var idbRange = lower === undefined
		              ? upper === undefined
		                  ? null
		                  : IdbKeyRange.upperBound(upper, !!upperOpen)
		              : upper === undefined
		                  ? IdbKeyRange.lowerBound(lower, !!lowerOpen)
		                  : IdbKeyRange.bound(lower, upper, !!lowerOpen, !!upperOpen);
		          return idbRange;
		      }
		      function createDbCoreTable(tableSchema) {
		          var tableName = tableSchema.name;
		          function mutate(_a) {
		              var trans = _a.trans, type = _a.type, keys = _a.keys, values = _a.values, range = _a.range;
		              return new Promise(function (resolve, reject) {
		                  resolve = wrap(resolve);
		                  var store = trans.objectStore(tableName);
		                  var outbound = store.keyPath == null;
		                  var isAddOrPut = type === 'put' || type === 'add';
		                  if (!isAddOrPut && type !== 'delete' && type !== 'deleteRange')
		                      throw new Error('Invalid operation type: ' + type);
		                  var length = (keys || values || { length: 1 }).length;
		                  if (keys && values && keys.length !== values.length) {
		                      throw new Error('Given keys array must have same length as given values array.');
		                  }
		                  if (length === 0)
		                      return resolve({
		                          numFailures: 0,
		                          failures: {},
		                          results: [],
		                          lastResult: undefined,
		                      });
		                  var req;
		                  var reqs = [];
		                  var failures = [];
		                  var numFailures = 0;
		                  var errorHandler = function (event) {
		                      ++numFailures;
		                      preventDefault(event);
		                  };
		                  if (type === 'deleteRange') {
		                      if (range.type === 4 )
		                          return resolve({
		                              numFailures: numFailures,
		                              failures: failures,
		                              results: [],
		                              lastResult: undefined,
		                          });
		                      if (range.type === 3 )
		                          reqs.push((req = store.clear()));
		                      else
		                          reqs.push((req = store.delete(makeIDBKeyRange(range))));
		                  }
		                  else {
		                      var _a = isAddOrPut
		                          ? outbound
		                              ? [values, keys]
		                              : [values, null]
		                          : [keys, null], args1 = _a[0], args2 = _a[1];
		                      if (isAddOrPut) {
		                          for (var i = 0; i < length; ++i) {
		                              reqs.push((req = (args2 && args2[i] !== undefined
		                                  ? store[type](args1[i], args2[i])
		                                  : store[type](args1[i]))));
		                              req.onerror = errorHandler;
		                          }
		                      }
		                      else {
		                          for (var i = 0; i < length; ++i) {
		                              reqs.push((req = store[type](args1[i])));
		                              req.onerror = errorHandler;
		                          }
		                      }
		                  }
		                  var done = function (event) {
		                      var lastResult = event.target.result;
		                      reqs.forEach(function (req, i) { return req.error != null && (failures[i] = req.error); });
		                      resolve({
		                          numFailures: numFailures,
		                          failures: failures,
		                          results: type === 'delete' ? keys : reqs.map(function (req) { return req.result; }),
		                          lastResult: lastResult,
		                      });
		                  };
		                  req.onerror = function (event) {
		                      errorHandler(event);
		                      done(event);
		                  };
		                  req.onsuccess = done;
		              });
		          }
		          function openCursor(_a) {
		              var trans = _a.trans, values = _a.values, query = _a.query, reverse = _a.reverse, unique = _a.unique;
		              return new Promise(function (resolve, reject) {
		                  resolve = wrap(resolve);
		                  var index = query.index, range = query.range;
		                  var store = trans.objectStore(tableName);
		                  var source = index.isPrimaryKey ? store : store.index(index.name);
		                  var direction = reverse
		                      ? unique
		                          ? 'prevunique'
		                          : 'prev'
		                      : unique
		                          ? 'nextunique'
		                          : 'next';
		                  var req = values || !('openKeyCursor' in source)
		                      ? source.openCursor(makeIDBKeyRange(range), direction)
		                      : source.openKeyCursor(makeIDBKeyRange(range), direction);
		                  req.onerror = eventRejectHandler(reject);
		                  req.onsuccess = wrap(function (ev) {
		                      var cursor = req.result;
		                      if (!cursor) {
		                          resolve(null);
		                          return;
		                      }
		                      cursor.___id = ++_id_counter;
		                      cursor.done = false;
		                      var _cursorContinue = cursor.continue.bind(cursor);
		                      var _cursorContinuePrimaryKey = cursor.continuePrimaryKey;
		                      if (_cursorContinuePrimaryKey)
		                          _cursorContinuePrimaryKey = _cursorContinuePrimaryKey.bind(cursor);
		                      var _cursorAdvance = cursor.advance.bind(cursor);
		                      var doThrowCursorIsNotStarted = function () {
		                          throw new Error('Cursor not started');
		                      };
		                      var doThrowCursorIsStopped = function () {
		                          throw new Error('Cursor not stopped');
		                      };
		                      cursor.trans = trans;
		                      cursor.stop =
		                          cursor.continue =
		                              cursor.continuePrimaryKey =
		                                  cursor.advance =
		                                      doThrowCursorIsNotStarted;
		                      cursor.fail = wrap(reject);
		                      cursor.next = function () {
		                          var _this = this;
		                          var gotOne = 1;
		                          return this.start(function () {
		                              return gotOne-- ? _this.continue() : _this.stop();
		                          }).then(function () { return _this; });
		                      };
		                      cursor.start = function (callback) {
		                          var iterationPromise = new Promise(function (resolveIteration, rejectIteration) {
		                              resolveIteration = wrap(resolveIteration);
		                              req.onerror = eventRejectHandler(rejectIteration);
		                              cursor.fail = rejectIteration;
		                              cursor.stop = function (value) {
		                                  cursor.stop =
		                                      cursor.continue =
		                                          cursor.continuePrimaryKey =
		                                              cursor.advance =
		                                                  doThrowCursorIsStopped;
		                                  resolveIteration(value);
		                              };
		                          });
		                          var guardedCallback = function () {
		                              if (req.result) {
		                                  try {
		                                      callback();
		                                  }
		                                  catch (err) {
		                                      cursor.fail(err);
		                                  }
		                              }
		                              else {
		                                  cursor.done = true;
		                                  cursor.start = function () {
		                                      throw new Error('Cursor behind last entry');
		                                  };
		                                  cursor.stop();
		                              }
		                          };
		                          req.onsuccess = wrap(function (ev) {
		                              req.onsuccess = guardedCallback;
		                              guardedCallback();
		                          });
		                          cursor.continue = _cursorContinue;
		                          cursor.continuePrimaryKey = _cursorContinuePrimaryKey;
		                          cursor.advance = _cursorAdvance;
		                          guardedCallback();
		                          return iterationPromise;
		                      };
		                      resolve(cursor);
		                  }, reject);
		              });
		          }
		          function query(hasGetAll, hasIdb3Features) {
		              return function (request) {
		                  return new Promise(function (resolve, reject) {
		                      var _a;
		                      resolve = wrap(resolve);
		                      var trans = request.trans, values = request.values, limit = request.limit, query = request.query;
		                      var direction = (_a = request.direction) !== null && _a !== void 0 ? _a : 'next';
		                      var nonInfinitLimit = limit === Infinity ? undefined : limit;
		                      var index = query.index, range = query.range;
		                      var store = trans.objectStore(tableName);
		                      var source = index.isPrimaryKey ? store : store.index(index.name);
		                      var idbKeyRange = makeIDBKeyRange(range);
		                      if (limit === 0)
		                          return resolve({ result: [] });
		                      if (hasIdb3Features) {
		                          var options = {
		                              query: idbKeyRange,
		                              count: nonInfinitLimit,
		                              direction: direction,
		                          };
		                          var req = values
		                              ? source.getAll(options)
		                              : source.getAllKeys(options);
		                          req.onsuccess = function (event) { return resolve({ result: event.target.result }); };
		                          req.onerror = eventRejectHandler(reject);
		                      }
		                      else if (hasGetAll && direction === 'next') {
		                          var req = values
		                              ? source.getAll(idbKeyRange, nonInfinitLimit)
		                              : source.getAllKeys(idbKeyRange, nonInfinitLimit);
		                          req.onsuccess = function (event) {
		                              return resolve({ result: event.target.result });
		                          };
		                          req.onerror = eventRejectHandler(reject);
		                      }
		                      else {
		                          var count_1 = 0;
		                          var req_1 = values || !('openKeyCursor' in source)
		                              ? source.openCursor(idbKeyRange, direction)
		                              : source.openKeyCursor(idbKeyRange, direction);
		                          var result_1 = [];
		                          req_1.onsuccess = function () {
		                              var cursor = req_1.result;
		                              if (!cursor)
		                                  return resolve({ result: result_1 });
		                              result_1.push(values ? cursor.value : cursor.primaryKey);
		                              if (++count_1 === limit)
		                                  return resolve({ result: result_1 });
		                              cursor.continue();
		                          };
		                          req_1.onerror = eventRejectHandler(reject);
		                      }
		                  });
		              };
		          }
		          return {
		              name: tableName,
		              schema: tableSchema,
		              mutate: mutate,
		              getMany: function (_a) {
		                  var trans = _a.trans, keys = _a.keys;
		                  return new Promise(function (resolve, reject) {
		                      resolve = wrap(resolve);
		                      var store = trans.objectStore(tableName);
		                      var length = keys.length;
		                      var result = new Array(length);
		                      var keyCount = 0;
		                      var callbackCount = 0;
		                      var req;
		                      var successHandler = function (event) {
		                          var req = event.target;
		                          if ((result[req._pos] = req.result) != null)
		                              ;
		                          if (++callbackCount === keyCount)
		                              resolve(result);
		                      };
		                      var errorHandler = eventRejectHandler(reject);
		                      for (var i = 0; i < length; ++i) {
		                          var key = keys[i];
		                          if (key != null) {
		                              req = store.get(keys[i]);
		                              req._pos = i;
		                              req.onsuccess = successHandler;
		                              req.onerror = errorHandler;
		                              ++keyCount;
		                          }
		                      }
		                      if (keyCount === 0)
		                          resolve(result);
		                  });
		              },
		              get: function (_a) {
		                  var trans = _a.trans, key = _a.key;
		                  return new Promise(function (resolve, reject) {
		                      resolve = wrap(resolve);
		                      var store = trans.objectStore(tableName);
		                      var req = store.get(key);
		                      req.onsuccess = function (event) { return resolve(event.target.result); };
		                      req.onerror = eventRejectHandler(reject);
		                  });
		              },
		              query: query(hasGetAll, hasIdb3Features),
		              openCursor: openCursor,
		              count: function (_a) {
		                  var query = _a.query, trans = _a.trans;
		                  var index = query.index, range = query.range;
		                  return new Promise(function (resolve, reject) {
		                      var store = trans.objectStore(tableName);
		                      var source = index.isPrimaryKey ? store : store.index(index.name);
		                      var idbKeyRange = makeIDBKeyRange(range);
		                      var req = idbKeyRange ? source.count(idbKeyRange) : source.count();
		                      req.onsuccess = wrap(function (ev) {
		                          return resolve(ev.target.result);
		                      });
		                      req.onerror = eventRejectHandler(reject);
		                  });
		              },
		          };
		      }
		      var _a = extractSchema(db, tmpTrans), schema = _a.schema, hasGetAll = _a.hasGetAll, hasIdb3Features = _a.hasIdb3Features;
		      var tables = schema.tables.map(function (tableSchema) {
		          return createDbCoreTable(tableSchema);
		      });
		      var tableMap = {};
		      tables.forEach(function (table) { return (tableMap[table.name] = table); });
		      return {
		          stack: 'dbcore',
		          transaction: db.transaction.bind(db),
		          table: function (name) {
		              var result = tableMap[name];
		              if (!result)
		                  throw new Error("Table '".concat(name, "' not found"));
		              return tableMap[name];
		          },
		          MIN_KEY: -Infinity,
		          MAX_KEY: getMaxKey(IdbKeyRange),
		          schema: schema,
		      };
		  }

		  function createMiddlewareStack(stackImpl, middlewares) {
		      return middlewares.reduce(function (down, _a) {
		          var create = _a.create;
		          return (__assign(__assign({}, down), create(down)));
		      }, stackImpl);
		  }
		  function createMiddlewareStacks(middlewares, idbdb, _a, tmpTrans) {
		      var IDBKeyRange = _a.IDBKeyRange; _a.indexedDB;
		      var dbcore = createMiddlewareStack(createDBCore(idbdb, IDBKeyRange, tmpTrans), middlewares.dbcore);
		      return {
		          dbcore: dbcore,
		      };
		  }
		  function generateMiddlewareStacks(db, tmpTrans) {
		      var idbdb = tmpTrans.db;
		      var stacks = createMiddlewareStacks(db._middlewares, idbdb, db._deps, tmpTrans);
		      db.core = stacks.dbcore;
		      db.tables.forEach(function (table) {
		          var tableName = table.name;
		          if (db.core.schema.tables.some(function (tbl) { return tbl.name === tableName; })) {
		              table.core = db.core.table(tableName);
		              if (db[tableName] instanceof db.Table) {
		                  db[tableName].core = table.core;
		              }
		          }
		      });
		  }

		  function setApiOnPlace(db, objs, tableNames, dbschema) {
		      tableNames.forEach(function (tableName) {
		          var schema = dbschema[tableName];
		          objs.forEach(function (obj) {
		              var propDesc = getPropertyDescriptor(obj, tableName);
		              if (!propDesc || ('value' in propDesc && propDesc.value === undefined)) {
		                  if (obj === db.Transaction.prototype || obj instanceof db.Transaction) {
		                      setProp(obj, tableName, {
		                          get: function () {
		                              return this.table(tableName);
		                          },
		                          set: function (value) {
		                              defineProperty(this, tableName, {
		                                  value: value,
		                                  writable: true,
		                                  configurable: true,
		                                  enumerable: true,
		                              });
		                          },
		                      });
		                  }
		                  else {
		                      obj[tableName] = new db.Table(tableName, schema);
		                  }
		              }
		          });
		      });
		  }
		  function removeTablesApi(db, objs) {
		      objs.forEach(function (obj) {
		          for (var key in obj) {
		              if (obj[key] instanceof db.Table)
		                  delete obj[key];
		          }
		      });
		  }
		  function lowerVersionFirst(a, b) {
		      return a._cfg.version - b._cfg.version;
		  }
		  function runUpgraders(db, oldVersion, idbUpgradeTrans, reject) {
		      var globalSchema = db._dbSchema;
		      if (idbUpgradeTrans.objectStoreNames.contains('$meta') &&
		          !globalSchema.$meta) {
		          globalSchema.$meta = createTableSchema('$meta', parseIndexSyntax('')[0], []);
		          db._storeNames.push('$meta');
		      }
		      var trans = db._createTransaction('readwrite', db._storeNames, globalSchema);
		      trans.create(idbUpgradeTrans);
		      trans._completion.catch(reject);
		      var rejectTransaction = trans._reject.bind(trans);
		      var transless = PSD.transless || PSD;
		      newScope(function () {
		          PSD.trans = trans;
		          PSD.transless = transless;
		          if (oldVersion === 0) {
		              keys(globalSchema).forEach(function (tableName) {
		                  createTable(idbUpgradeTrans, tableName, globalSchema[tableName].primKey, globalSchema[tableName].indexes);
		              });
		              generateMiddlewareStacks(db, idbUpgradeTrans);
		              DexiePromise.follow(function () { return db.on.populate.fire(trans); }).catch(rejectTransaction);
		          }
		          else {
		              generateMiddlewareStacks(db, idbUpgradeTrans);
		              return getExistingVersion(db, trans, oldVersion)
		                  .then(function (oldVersion) {
		                  return updateTablesAndIndexes(db, oldVersion, trans, idbUpgradeTrans);
		              })
		                  .catch(rejectTransaction);
		          }
		      });
		  }
		  function patchCurrentVersion(db, idbUpgradeTrans) {
		      createMissingTables(db._dbSchema, idbUpgradeTrans);
		      if (idbUpgradeTrans.db.version % 10 === 0 &&
		          !idbUpgradeTrans.objectStoreNames.contains('$meta')) {
		          idbUpgradeTrans.db
		              .createObjectStore('$meta')
		              .add(Math.ceil(idbUpgradeTrans.db.version / 10 - 1), 'version');
		      }
		      var globalSchema = buildGlobalSchema(db, db.idbdb, idbUpgradeTrans);
		      adjustToExistingIndexNames(db, db._dbSchema, idbUpgradeTrans);
		      var diff = getSchemaDiff(globalSchema, db._dbSchema);
		      var _loop_1 = function (tableChange) {
		          if (tableChange.change.length || tableChange.recreate) {
		              console.warn("Unable to patch indexes of table ".concat(tableChange.name, " because it has changes on the type of index or primary key."));
		              return { value: void 0 };
		          }
		          var store = idbUpgradeTrans.objectStore(tableChange.name);
		          tableChange.add.forEach(function (idx) {
		              if (debug)
		                  console.debug("Dexie upgrade patch: Creating missing index ".concat(tableChange.name, ".").concat(idx.src));
		              addIndex(store, idx);
		          });
		      };
		      for (var _i = 0, _a = diff.change; _i < _a.length; _i++) {
		          var tableChange = _a[_i];
		          var state_1 = _loop_1(tableChange);
		          if (typeof state_1 === "object")
		              return state_1.value;
		      }
		  }
		  function getExistingVersion(db, trans, oldVersion) {
		      if (trans.storeNames.includes('$meta')) {
		          return trans
		              .table('$meta')
		              .get('version')
		              .then(function (metaVersion) {
		              return metaVersion != null ? metaVersion : oldVersion;
		          });
		      }
		      else {
		          return DexiePromise.resolve(oldVersion);
		      }
		  }
		  function updateTablesAndIndexes(db, oldVersion, trans, idbUpgradeTrans) {
		      var queue = [];
		      var versions = db._versions;
		      var globalSchema = (db._dbSchema = buildGlobalSchema(db, db.idbdb, idbUpgradeTrans));
		      var versToRun = versions.filter(function (v) { return v._cfg.version >= oldVersion; });
		      if (versToRun.length === 0) {
		          return DexiePromise.resolve();
		      }
		      versToRun.forEach(function (version) {
		          queue.push(function () {
		              var oldSchema = globalSchema;
		              var newSchema = version._cfg.dbschema;
		              adjustToExistingIndexNames(db, oldSchema, idbUpgradeTrans);
		              adjustToExistingIndexNames(db, newSchema, idbUpgradeTrans);
		              globalSchema = db._dbSchema = newSchema;
		              var diff = getSchemaDiff(oldSchema, newSchema);
		              diff.add.forEach(function (tuple) {
		                  createTable(idbUpgradeTrans, tuple[0], tuple[1].primKey, tuple[1].indexes);
		              });
		              diff.change.forEach(function (change) {
		                  if (change.recreate) {
		                      throw new exceptions.Upgrade('Not yet support for changing primary key');
		                  }
		                  else {
		                      var store_1 = idbUpgradeTrans.objectStore(change.name);
		                      change.add.forEach(function (idx) { return addIndex(store_1, idx); });
		                      change.change.forEach(function (idx) {
		                          store_1.deleteIndex(idx.name);
		                          addIndex(store_1, idx);
		                      });
		                      change.del.forEach(function (idxName) { return store_1.deleteIndex(idxName); });
		                  }
		              });
		              var contentUpgrade = version._cfg.contentUpgrade;
		              if (contentUpgrade && version._cfg.version > oldVersion) {
		                  generateMiddlewareStacks(db, idbUpgradeTrans);
		                  trans._memoizedTables = {};
		                  var upgradeSchema_1 = shallowClone(newSchema);
		                  diff.del.forEach(function (table) {
		                      upgradeSchema_1[table] = oldSchema[table];
		                  });
		                  removeTablesApi(db, [db.Transaction.prototype]);
		                  setApiOnPlace(db, [db.Transaction.prototype], keys(upgradeSchema_1), upgradeSchema_1);
		                  trans.schema = upgradeSchema_1;
		                  var contentUpgradeIsAsync_1 = isAsyncFunction(contentUpgrade);
		                  if (contentUpgradeIsAsync_1) {
		                      incrementExpectedAwaits();
		                  }
		                  var returnValue_1;
		                  var promiseFollowed = DexiePromise.follow(function () {
		                      returnValue_1 = contentUpgrade(trans);
		                      if (returnValue_1) {
		                          if (contentUpgradeIsAsync_1) {
		                              var decrementor = decrementExpectedAwaits.bind(null, null);
		                              returnValue_1.then(decrementor, decrementor);
		                          }
		                      }
		                  });
		                  return returnValue_1 && typeof returnValue_1.then === 'function'
		                      ? DexiePromise.resolve(returnValue_1)
		                      : promiseFollowed.then(function () { return returnValue_1; });
		              }
		          });
		          queue.push(function (idbtrans) {
		              var newSchema = version._cfg.dbschema;
		              deleteRemovedTables(newSchema, idbtrans);
		              removeTablesApi(db, [db.Transaction.prototype]);
		              setApiOnPlace(db, [db.Transaction.prototype], db._storeNames, db._dbSchema);
		              trans.schema = db._dbSchema;
		          });
		          queue.push(function (idbtrans) {
		              if (db.idbdb.objectStoreNames.contains('$meta')) {
		                  if (Math.ceil(db.idbdb.version / 10) === version._cfg.version) {
		                      db.idbdb.deleteObjectStore('$meta');
		                      delete db._dbSchema.$meta;
		                      db._storeNames = db._storeNames.filter(function (name) { return name !== '$meta'; });
		                  }
		                  else {
		                      idbtrans.objectStore('$meta').put(version._cfg.version, 'version');
		                  }
		              }
		          });
		      });
		      function runQueue() {
		          return queue.length
		              ? DexiePromise.resolve(queue.shift()(trans.idbtrans)).then(runQueue)
		              : DexiePromise.resolve();
		      }
		      return runQueue().then(function () {
		          createMissingTables(globalSchema, idbUpgradeTrans);
		      });
		  }
		  function getSchemaDiff(oldSchema, newSchema) {
		      var diff = {
		          del: [],
		          add: [],
		          change: [],
		      };
		      var table;
		      for (table in oldSchema) {
		          if (!newSchema[table])
		              diff.del.push(table);
		      }
		      for (table in newSchema) {
		          var oldDef = oldSchema[table], newDef = newSchema[table];
		          if (!oldDef) {
		              diff.add.push([table, newDef]);
		          }
		          else {
		              var change = {
		                  name: table,
		                  def: newDef,
		                  recreate: false,
		                  del: [],
		                  add: [],
		                  change: [],
		              };
		              if (
		              '' + (oldDef.primKey.keyPath || '') !==
		                  '' + (newDef.primKey.keyPath || '') ||
		                  oldDef.primKey.auto !== newDef.primKey.auto) {
		                  change.recreate = true;
		                  diff.change.push(change);
		              }
		              else {
		                  var oldIndexes = oldDef.idxByName;
		                  var newIndexes = newDef.idxByName;
		                  var idxName = void 0;
		                  for (idxName in oldIndexes) {
		                      if (!newIndexes[idxName])
		                          change.del.push(idxName);
		                  }
		                  for (idxName in newIndexes) {
		                      var oldIdx = oldIndexes[idxName], newIdx = newIndexes[idxName];
		                      if (!oldIdx)
		                          change.add.push(newIdx);
		                      else if (oldIdx.src !== newIdx.src)
		                          change.change.push(newIdx);
		                  }
		                  if (change.del.length > 0 ||
		                      change.add.length > 0 ||
		                      change.change.length > 0) {
		                      diff.change.push(change);
		                  }
		              }
		          }
		      }
		      return diff;
		  }
		  function createTable(idbtrans, tableName, primKey, indexes) {
		      var store = idbtrans.db.createObjectStore(tableName, primKey.keyPath
		          ? { keyPath: primKey.keyPath, autoIncrement: primKey.auto }
		          : { autoIncrement: primKey.auto });
		      indexes.forEach(function (idx) { return addIndex(store, idx); });
		      return store;
		  }
		  function createMissingTables(newSchema, idbtrans) {
		      keys(newSchema).forEach(function (tableName) {
		          if (!idbtrans.db.objectStoreNames.contains(tableName)) {
		              if (debug)
		                  console.debug('Dexie: Creating missing table', tableName);
		              createTable(idbtrans, tableName, newSchema[tableName].primKey, newSchema[tableName].indexes);
		          }
		      });
		  }
		  function deleteRemovedTables(newSchema, idbtrans) {
		      [].slice
		          .call(idbtrans.db.objectStoreNames)
		          .forEach(function (storeName) {
		          return newSchema[storeName] == null && idbtrans.db.deleteObjectStore(storeName);
		      });
		  }
		  function addIndex(store, idx) {
		      store.createIndex(idx.name, idx.keyPath, {
		          unique: idx.unique,
		          multiEntry: idx.multi,
		      });
		  }
		  function buildGlobalSchema(db, idbdb, tmpTrans) {
		      var globalSchema = {};
		      var dbStoreNames = slice(idbdb.objectStoreNames, 0);
		      dbStoreNames.forEach(function (storeName) {
		          var store = tmpTrans.objectStore(storeName);
		          var keyPath = store.keyPath;
		          var primKey = createIndexSpec(nameFromKeyPath(keyPath), keyPath || '', true, false, !!store.autoIncrement, keyPath && typeof keyPath !== 'string', true);
		          var indexes = [];
		          for (var j = 0; j < store.indexNames.length; ++j) {
		              var idbindex = store.index(store.indexNames[j]);
		              keyPath = idbindex.keyPath;
		              var index = createIndexSpec(idbindex.name, keyPath, !!idbindex.unique, !!idbindex.multiEntry, false, keyPath && typeof keyPath !== 'string', false);
		              indexes.push(index);
		          }
		          globalSchema[storeName] = createTableSchema(storeName, primKey, indexes);
		      });
		      return globalSchema;
		  }
		  function readGlobalSchema(db, idbdb, tmpTrans) {
		      db.verno = idbdb.version / 10;
		      var globalSchema = (db._dbSchema = buildGlobalSchema(db, idbdb, tmpTrans));
		      db._storeNames = slice(idbdb.objectStoreNames, 0);
		      setApiOnPlace(db, [db._allTables], keys(globalSchema), globalSchema);
		  }
		  function verifyInstalledSchema(db, tmpTrans) {
		      var installedSchema = buildGlobalSchema(db, db.idbdb, tmpTrans);
		      var diff = getSchemaDiff(installedSchema, db._dbSchema);
		      return !(diff.add.length ||
		          diff.change.some(function (ch) { return ch.add.length || ch.change.length; }));
		  }
		  function adjustToExistingIndexNames(db, schema, idbtrans) {
		      var storeNames = idbtrans.db.objectStoreNames;
		      for (var i = 0; i < storeNames.length; ++i) {
		          var storeName = storeNames[i];
		          var store = idbtrans.objectStore(storeName);
		          db._hasGetAll = 'getAll' in store;
		          for (var j = 0; j < store.indexNames.length; ++j) {
		              var indexName = store.indexNames[j];
		              var keyPath = store.index(indexName).keyPath;
		              var dexieName = typeof keyPath === 'string'
		                  ? keyPath
		                  : '[' + slice(keyPath).join('+') + ']';
		              if (schema[storeName]) {
		                  var indexSpec = schema[storeName].idxByName[dexieName];
		                  if (indexSpec) {
		                      indexSpec.name = indexName;
		                      delete schema[storeName].idxByName[dexieName];
		                      schema[storeName].idxByName[indexName] = indexSpec;
		                  }
		              }
		          }
		      }
		      if (typeof navigator !== 'undefined' &&
		          /Safari/.test(navigator.userAgent) &&
		          !/(Chrome\/|Edge\/)/.test(navigator.userAgent) &&
		          _global.WorkerGlobalScope &&
		          _global instanceof _global.WorkerGlobalScope &&
		          [].concat(navigator.userAgent.match(/Safari\/(\d*)/))[1] < 604) {
		          db._hasGetAll = false;
		      }
		  }
		  function parseIndexSyntax(primKeyAndIndexes) {
		      return primKeyAndIndexes.split(',').map(function (index, indexNum) {
		          var _a;
		          var typeSplit = index.split(':');
		          var type = (_a = typeSplit[1]) === null || _a === void 0 ? void 0 : _a.trim();
		          index = typeSplit[0].trim();
		          var name = index.replace(/([&*]|\+\+)/g, '');
		          var keyPath = /^\[/.test(name)
		              ? name.match(/^\[(.*)\]$/)[1].split('+')
		              : name;
		          return createIndexSpec(name, keyPath || null, /\&/.test(index), /\*/.test(index), /\+\+/.test(index), isArray(keyPath), indexNum === 0, type);
		      });
		  }

		  var Version =  (function () {
		      function Version() {
		      }
		      Version.prototype._createTableSchema = function (name, primKey, indexes) {
		          return createTableSchema(name, primKey, indexes);
		      };
		      Version.prototype._parseIndexSyntax = function (primKeyAndIndexes) {
		          return parseIndexSyntax(primKeyAndIndexes);
		      };
		      Version.prototype._parseStoresSpec = function (stores, outSchema) {
		          var _this = this;
		          keys(stores).forEach(function (tableName) {
		              if (stores[tableName] !== null) {
		                  var indexes = _this._parseIndexSyntax(stores[tableName]);
		                  var primKey = indexes.shift();
		                  if (!primKey) {
		                      throw new exceptions.Schema('Invalid schema for table ' + tableName + ': ' + stores[tableName]);
		                  }
		                  primKey.unique = true;
		                  if (primKey.multi)
		                      throw new exceptions.Schema('Primary key cannot be multiEntry*');
		                  indexes.forEach(function (idx) {
		                      if (idx.auto)
		                          throw new exceptions.Schema('Only primary key can be marked as autoIncrement (++)');
		                      if (!idx.keyPath)
		                          throw new exceptions.Schema('Index must have a name and cannot be an empty string');
		                  });
		                  var tblSchema = _this._createTableSchema(tableName, primKey, indexes);
		                  outSchema[tableName] = tblSchema;
		              }
		          });
		      };
		      Version.prototype.stores = function (stores) {
		          var db = this.db;
		          this._cfg.storesSource = this._cfg.storesSource
		              ? extend(this._cfg.storesSource, stores)
		              : stores;
		          var versions = db._versions;
		          var storesSpec = {};
		          var dbschema = {};
		          versions.forEach(function (version) {
		              extend(storesSpec, version._cfg.storesSource);
		              dbschema = version._cfg.dbschema = {};
		              version._parseStoresSpec(storesSpec, dbschema);
		          });
		          db._dbSchema = dbschema;
		          removeTablesApi(db, [db._allTables, db, db.Transaction.prototype]);
		          setApiOnPlace(db, [db._allTables, db, db.Transaction.prototype, this._cfg.tables], keys(dbschema), dbschema);
		          db._storeNames = keys(dbschema);
		          return this;
		      };
		      Version.prototype.upgrade = function (upgradeFunction) {
		          this._cfg.contentUpgrade = promisableChain(this._cfg.contentUpgrade || nop, upgradeFunction);
		          return this;
		      };
		      return Version;
		  }());

		  function createVersionConstructor(db) {
		      return makeClassConstructor(Version.prototype, function Version(versionNumber) {
		          this.db = db;
		          this._cfg = {
		              version: versionNumber,
		              storesSource: null,
		              dbschema: {},
		              tables: {},
		              contentUpgrade: null,
		          };
		      });
		  }

		  var connections = createConnectionsManager();
		  function createConnectionsManager() {
		      if (typeof FinalizationRegistry !== 'undefined' &&
		          typeof WeakRef !== 'undefined') {
		          var _refs_1 = new Set();
		          var _registry_1 = new FinalizationRegistry(function (ref) {
		              _refs_1.delete(ref);
		          });
		          var toArray = function () {
		              return Array.from(_refs_1)
		                  .map(function (ref) { return ref.deref(); })
		                  .filter(function (db) { return db !== undefined; });
		          };
		          var add = function (db) {
		              var ref = new WeakRef(db._novip);
		              _refs_1.add(ref);
		              _registry_1.register(db._novip, ref, ref);
		              if (_refs_1.size > db._options.maxConnections) {
		                  var oldestRef = _refs_1.values().next().value;
		                  _refs_1.delete(oldestRef);
		                  _registry_1.unregister(oldestRef);
		              }
		          };
		          var remove = function (db) {
		              if (!db)
		                  return;
		              var iterator = _refs_1.values();
		              var result = iterator.next();
		              while (!result.done) {
		                  var ref = result.value;
		                  if (ref.deref() === db._novip) {
		                      _refs_1.delete(ref);
		                      _registry_1.unregister(ref);
		                      return;
		                  }
		                  result = iterator.next();
		              }
		          };
		          return { toArray: toArray, add: add, remove: remove };
		      }
		      else {
		          var connections_1 = [];
		          var toArray = function () { return connections_1; };
		          var add = function (db) {
		              connections_1.push(db._novip);
		          };
		          var remove = function (db) {
		              if (!db)
		                  return;
		              var index = connections_1.indexOf(db._novip);
		              if (index !== -1) {
		                  connections_1.splice(index, 1);
		              }
		          };
		          return { toArray: toArray, add: add, remove: remove };
		      }
		  }

		  function getDbNamesTable(indexedDB, IDBKeyRange) {
		      var dbNamesDB = indexedDB['_dbNamesDB'];
		      if (!dbNamesDB) {
		          dbNamesDB = indexedDB['_dbNamesDB'] = new Dexie$1(DBNAMES_DB, {
		              addons: [],
		              indexedDB: indexedDB,
		              IDBKeyRange: IDBKeyRange,
		          });
		          dbNamesDB.version(1).stores({ dbnames: 'name' });
		      }
		      return dbNamesDB.table('dbnames');
		  }
		  function hasDatabasesNative(indexedDB) {
		      return indexedDB && typeof indexedDB.databases === 'function';
		  }
		  function getDatabaseNames(_a) {
		      var indexedDB = _a.indexedDB, IDBKeyRange = _a.IDBKeyRange;
		      return hasDatabasesNative(indexedDB)
		          ? Promise.resolve(indexedDB.databases()).then(function (infos) {
		              return infos
		                  .map(function (info) { return info.name; })
		                  .filter(function (name) { return name !== DBNAMES_DB; });
		          })
		          : getDbNamesTable(indexedDB, IDBKeyRange).toCollection().primaryKeys();
		  }
		  function _onDatabaseCreated(_a, name) {
		      var indexedDB = _a.indexedDB, IDBKeyRange = _a.IDBKeyRange;
		      !hasDatabasesNative(indexedDB) &&
		          name !== DBNAMES_DB &&
		          getDbNamesTable(indexedDB, IDBKeyRange).put({ name: name }).catch(nop);
		  }
		  function _onDatabaseDeleted(_a, name) {
		      var indexedDB = _a.indexedDB, IDBKeyRange = _a.IDBKeyRange;
		      !hasDatabasesNative(indexedDB) &&
		          name !== DBNAMES_DB &&
		          getDbNamesTable(indexedDB, IDBKeyRange).delete(name).catch(nop);
		  }

		  function vip(fn) {
		      return newScope(function () {
		          PSD.letThrough = true;
		          return fn();
		      });
		  }

		  function idbReady() {
		      var isSafari = !navigator.userAgentData &&
		          /Safari\//.test(navigator.userAgent) &&
		          !/Chrom(e|ium)\//.test(navigator.userAgent);
		      if (!isSafari || !indexedDB.databases)
		          return Promise.resolve();
		      var intervalId;
		      return new Promise(function (resolve) {
		          var tryIdb = function () { return indexedDB.databases().finally(resolve); };
		          intervalId = setInterval(tryIdb, 100);
		          tryIdb();
		      }).finally(function () { return clearInterval(intervalId); });
		  }

		  var _a;
		  function isEmptyRange(node) {
		      return !('from' in node);
		  }
		  var RangeSet = function (fromOrTree, to) {
		      if (this) {
		          extend(this, arguments.length
		              ? { d: 1, from: fromOrTree, to: arguments.length > 1 ? to : fromOrTree }
		              : { d: 0 });
		      }
		      else {
		          var rv = new RangeSet();
		          if (fromOrTree && 'd' in fromOrTree) {
		              extend(rv, fromOrTree);
		          }
		          return rv;
		      }
		  };
		  props(RangeSet.prototype, (_a = {
		          add: function (rangeSet) {
		              mergeRanges(this, rangeSet);
		              return this;
		          },
		          addKey: function (key) {
		              addRange(this, key, key);
		              return this;
		          },
		          addKeys: function (keys) {
		              var _this = this;
		              keys.forEach(function (key) { return addRange(_this, key, key); });
		              return this;
		          },
		          hasKey: function (key) {
		              var node = getRangeSetIterator(this).next(key).value;
		              return node && cmp(node.from, key) <= 0 && cmp(node.to, key) >= 0;
		          }
		      },
		      _a[iteratorSymbol] = function () {
		          return getRangeSetIterator(this);
		      },
		      _a));
		  function addRange(target, from, to) {
		      var diff = cmp(from, to);
		      if (isNaN(diff))
		          return;
		      if (diff > 0)
		          throw RangeError();
		      if (isEmptyRange(target))
		          return extend(target, { from: from, to: to, d: 1 });
		      var left = target.l;
		      var right = target.r;
		      if (cmp(to, target.from) < 0) {
		          left
		              ? addRange(left, from, to)
		              : (target.l = { from: from, to: to, d: 1, l: null, r: null });
		          return rebalance(target);
		      }
		      if (cmp(from, target.to) > 0) {
		          right
		              ? addRange(right, from, to)
		              : (target.r = { from: from, to: to, d: 1, l: null, r: null });
		          return rebalance(target);
		      }
		      if (cmp(from, target.from) < 0) {
		          target.from = from;
		          target.l = null;
		          target.d = right ? right.d + 1 : 1;
		      }
		      if (cmp(to, target.to) > 0) {
		          target.to = to;
		          target.r = null;
		          target.d = target.l ? target.l.d + 1 : 1;
		      }
		      var rightWasCutOff = !target.r;
		      if (left && !target.l) {
		          mergeRanges(target, left);
		      }
		      if (right && rightWasCutOff) {
		          mergeRanges(target, right);
		      }
		  }
		  function mergeRanges(target, newSet) {
		      function _addRangeSet(target, _a) {
		          var from = _a.from, to = _a.to, l = _a.l, r = _a.r;
		          addRange(target, from, to);
		          if (l)
		              _addRangeSet(target, l);
		          if (r)
		              _addRangeSet(target, r);
		      }
		      if (!isEmptyRange(newSet))
		          _addRangeSet(target, newSet);
		  }
		  function rangesOverlap(rangeSet1, rangeSet2) {
		      var i1 = getRangeSetIterator(rangeSet2);
		      var nextResult1 = i1.next();
		      if (nextResult1.done)
		          return false;
		      var a = nextResult1.value;
		      var i2 = getRangeSetIterator(rangeSet1);
		      var nextResult2 = i2.next(a.from);
		      var b = nextResult2.value;
		      while (!nextResult1.done && !nextResult2.done) {
		          if (cmp(b.from, a.to) <= 0 && cmp(b.to, a.from) >= 0)
		              return true;
		          cmp(a.from, b.from) < 0
		              ? (a = (nextResult1 = i1.next(b.from)).value)
		              : (b = (nextResult2 = i2.next(a.from)).value);
		      }
		      return false;
		  }
		  function getRangeSetIterator(node) {
		      var state = isEmptyRange(node)
		          ? null
		          : { s: 0, n: node };
		      return {
		          next: function (key) {
		              var keyProvided = arguments.length > 0;
		              while (state) {
		                  switch (state.s) {
		                      case 0:
		                          state.s = 1;
		                          if (keyProvided) {
		                              while (state.n.l && cmp(key, state.n.from) < 0)
		                                  state = { up: state, n: state.n.l, s: 1 };
		                          }
		                          else {
		                              while (state.n.l)
		                                  state = { up: state, n: state.n.l, s: 1 };
		                          }
		                      case 1:
		                          state.s = 2;
		                          if (!keyProvided || cmp(key, state.n.to) <= 0)
		                              return { value: state.n, done: false };
		                      case 2:
		                          if (state.n.r) {
		                              state.s = 3;
		                              state = { up: state, n: state.n.r, s: 0 };
		                              continue;
		                          }
		                      case 3:
		                          state = state.up;
		                  }
		              }
		              return { done: true };
		          },
		      };
		  }
		  function rebalance(target) {
		      var _a, _b;
		      var diff = (((_a = target.r) === null || _a === void 0 ? void 0 : _a.d) || 0) - (((_b = target.l) === null || _b === void 0 ? void 0 : _b.d) || 0);
		      var r = diff > 1 ? 'r' : diff < -1 ? 'l' : '';
		      if (r) {
		          var l = r === 'r' ? 'l' : 'r';
		          var rootClone = __assign({}, target);
		          var oldRootRight = target[r];
		          target.from = oldRootRight.from;
		          target.to = oldRootRight.to;
		          target[r] = oldRootRight[r];
		          rootClone[r] = oldRootRight[l];
		          target[l] = rootClone;
		          rootClone.d = computeDepth(rootClone);
		      }
		      target.d = computeDepth(target);
		  }
		  function computeDepth(_a) {
		      var r = _a.r, l = _a.l;
		      return (r ? (l ? Math.max(r.d, l.d) : r.d) : l ? l.d : 0) + 1;
		  }

		  function extendObservabilitySet(target, newSet) {
		      keys(newSet).forEach(function (part) {
		          if (target[part])
		              mergeRanges(target[part], newSet[part]);
		          else
		              target[part] = cloneSimpleObjectTree(newSet[part]);
		      });
		      return target;
		  }

		  function obsSetsOverlap(os1, os2) {
		      return (os1.all ||
		          os2.all ||
		          Object.keys(os1).some(function (key) { return os2[key] && rangesOverlap(os2[key], os1[key]); }));
		  }

		  var cache = {};

		  var unsignaledParts = {};
		  var isTaskEnqueued = false;
		  function signalSubscribersLazily(part, optimistic) {
		      extendObservabilitySet(unsignaledParts, part);
		      if (!isTaskEnqueued) {
		          isTaskEnqueued = true;
		          setTimeout(function () {
		              isTaskEnqueued = false;
		              var parts = unsignaledParts;
		              unsignaledParts = {};
		              signalSubscribersNow(parts, false);
		          }, 0);
		      }
		  }
		  function signalSubscribersNow(updatedParts, deleteAffectedCacheEntries) {
		      if (deleteAffectedCacheEntries === void 0) { deleteAffectedCacheEntries = false; }
		      var queriesToSignal = new Set();
		      if (updatedParts.all) {
		          for (var _i = 0, _a = Object.values(cache); _i < _a.length; _i++) {
		              var tblCache = _a[_i];
		              collectTableSubscribers(tblCache, updatedParts, queriesToSignal, deleteAffectedCacheEntries);
		          }
		      }
		      else {
		          for (var key in updatedParts) {
		              var parts = /^idb\:\/\/(.*)\/(.*)\//.exec(key);
		              if (parts) {
		                  var dbName = parts[1], tableName = parts[2];
		                  var tblCache = cache["idb://".concat(dbName, "/").concat(tableName)];
		                  if (tblCache)
		                      collectTableSubscribers(tblCache, updatedParts, queriesToSignal, deleteAffectedCacheEntries);
		              }
		          }
		      }
		      queriesToSignal.forEach(function (requery) { return requery(); });
		  }
		  function collectTableSubscribers(tblCache, updatedParts, outQueriesToSignal, deleteAffectedCacheEntries) {
		      var updatedEntryLists = [];
		      for (var _i = 0, _a = Object.entries(tblCache.queries.query); _i < _a.length; _i++) {
		          var _b = _a[_i], indexName = _b[0], entries = _b[1];
		          var filteredEntries = [];
		          for (var _c = 0, entries_1 = entries; _c < entries_1.length; _c++) {
		              var entry = entries_1[_c];
		              if (obsSetsOverlap(updatedParts, entry.obsSet)) {
		                  entry.subscribers.forEach(function (requery) { return outQueriesToSignal.add(requery); });
		              }
		              else if (deleteAffectedCacheEntries) {
		                  filteredEntries.push(entry);
		              }
		          }
		          if (deleteAffectedCacheEntries)
		              updatedEntryLists.push([indexName, filteredEntries]);
		      }
		      if (deleteAffectedCacheEntries) {
		          for (var _d = 0, updatedEntryLists_1 = updatedEntryLists; _d < updatedEntryLists_1.length; _d++) {
		              var _e = updatedEntryLists_1[_d], indexName = _e[0], filteredEntries = _e[1];
		              tblCache.queries.query[indexName] = filteredEntries;
		          }
		      }
		  }

		  function dexieOpen(db) {
		      var state = db._state;
		      var indexedDB = db._deps.indexedDB;
		      if (state.isBeingOpened || db.idbdb)
		          return state.dbReadyPromise.then(function () {
		              return state.dbOpenError ? rejection(state.dbOpenError) : db;
		          });
		      state.isBeingOpened = true;
		      state.dbOpenError = null;
		      state.openComplete = false;
		      var openCanceller = state.openCanceller;
		      var nativeVerToOpen = Math.round(db.verno * 10);
		      var schemaPatchMode = false;
		      function throwIfCancelled() {
		          if (state.openCanceller !== openCanceller)
		              throw new exceptions.DatabaseClosed('db.open() was cancelled');
		      }
		      var resolveDbReady = state.dbReadyResolve,
		      upgradeTransaction = null, wasCreated = false;
		      var tryOpenDB = function () {
		          return new DexiePromise(function (resolve, reject) {
		              throwIfCancelled();
		              if (!indexedDB)
		                  throw new exceptions.MissingAPI();
		              var dbName = db.name;
		              var req = state.autoSchema || !nativeVerToOpen
		                  ? indexedDB.open(dbName)
		                  : indexedDB.open(dbName, nativeVerToOpen);
		              if (!req)
		                  throw new exceptions.MissingAPI();
		              req.onerror = eventRejectHandler(reject);
		              req.onblocked = wrap(db._fireOnBlocked);
		              req.onupgradeneeded = wrap(function (e) {
		                  upgradeTransaction = req.transaction;
		                  if (state.autoSchema && !db._options.allowEmptyDB) {
		                      req.onerror = preventDefault;
		                      upgradeTransaction.abort();
		                      req.result.close();
		                      var delreq = indexedDB.deleteDatabase(dbName);
		                      delreq.onsuccess = delreq.onerror = wrap(function () {
		                          reject(new exceptions.NoSuchDatabase("Database ".concat(dbName, " doesnt exist")));
		                      });
		                  }
		                  else {
		                      upgradeTransaction.onerror = eventRejectHandler(reject);
		                      var oldVer = e.oldVersion > Math.pow(2, 62) ? 0 : e.oldVersion;
		                      wasCreated = oldVer < 1;
		                      db.idbdb = req.result;
		                      if (schemaPatchMode) {
		                          patchCurrentVersion(db, upgradeTransaction);
		                      }
		                      runUpgraders(db, oldVer / 10, upgradeTransaction, reject);
		                  }
		              }, reject);
		              req.onsuccess = wrap(function () {
		                  upgradeTransaction = null;
		                  var idbdb = (db.idbdb = req.result);
		                  var objectStoreNames = slice(idbdb.objectStoreNames);
		                  if (objectStoreNames.length > 0)
		                      try {
		                          var tmpTrans = idbdb.transaction(safariMultiStoreFix(objectStoreNames), 'readonly');
		                          if (state.autoSchema)
		                              readGlobalSchema(db, idbdb, tmpTrans);
		                          else {
		                              adjustToExistingIndexNames(db, db._dbSchema, tmpTrans);
		                              if (!verifyInstalledSchema(db, tmpTrans) && !schemaPatchMode) {
		                                  console.warn("Dexie SchemaDiff: Schema was extended without increasing the number passed to db.version(). Dexie will add missing parts and increment native version number to workaround this.");
		                                  idbdb.close();
		                                  nativeVerToOpen = idbdb.version + 1;
		                                  schemaPatchMode = true;
		                                  return resolve(tryOpenDB());
		                              }
		                          }
		                          generateMiddlewareStacks(db, tmpTrans);
		                      }
		                      catch (e) {
		                      }
		                  connections.add(db);
		                  idbdb.onversionchange = wrap(function (ev) {
		                      state.vcFired = true;
		                      db.on('versionchange').fire(ev);
		                  });
		                  idbdb.onclose = wrap(function () {
		                      db.close({ disableAutoOpen: false });
		                  });
		                  if (wasCreated)
		                      _onDatabaseCreated(db._deps, dbName);
		                  resolve();
		              }, reject);
		          }).catch(function (err) {
		              switch (err === null || err === void 0 ? void 0 : err.name) {
		                  case 'UnknownError':
		                      if (state.PR1398_maxLoop > 0) {
		                          state.PR1398_maxLoop--;
		                          console.warn('Dexie: Workaround for Chrome UnknownError on open()');
		                          return tryOpenDB();
		                      }
		                      break;
		                  case 'VersionError':
		                      if (nativeVerToOpen > 0) {
		                          nativeVerToOpen = 0;
		                          return tryOpenDB();
		                      }
		                      break;
		              }
		              return DexiePromise.reject(err);
		          });
		      };
		      return DexiePromise.race([
		          openCanceller,
		          (typeof navigator === 'undefined'
		              ? DexiePromise.resolve()
		              : idbReady()).then(tryOpenDB),
		      ])
		          .then(function () {
		          throwIfCancelled();
		          state.onReadyBeingFired = [];
		          return DexiePromise.resolve(vip(function () { return db.on.ready.fire(db.vip); })).then(function fireRemainders() {
		              if (state.onReadyBeingFired.length > 0) {
		                  var remainders_1 = state.onReadyBeingFired.reduce(promisableChain, nop);
		                  state.onReadyBeingFired = [];
		                  return DexiePromise.resolve(vip(function () { return remainders_1(db.vip); })).then(fireRemainders);
		              }
		          });
		      })
		          .finally(function () {
		          if (state.openCanceller === openCanceller) {
		              state.onReadyBeingFired = null;
		              state.isBeingOpened = false;
		          }
		      })
		          .catch(function (err) {
		          state.dbOpenError = err;
		          try {
		              upgradeTransaction && upgradeTransaction.abort();
		          }
		          catch (_a) { }
		          if (openCanceller === state.openCanceller) {
		              db._close();
		          }
		          return rejection(err);
		      })
		          .finally(function () {
		          state.openComplete = true;
		          resolveDbReady();
		      })
		          .then(function () {
		          if (wasCreated) {
		              var everything_1 = {};
		              db.tables.forEach(function (table) {
		                  table.schema.indexes.forEach(function (idx) {
		                      if (idx.name)
		                          everything_1["idb://".concat(db.name, "/").concat(table.name, "/").concat(idx.name)] =
		                              new RangeSet(-Infinity, [[[]]]);
		                  });
		                  everything_1["idb://".concat(db.name, "/").concat(table.name, "/")] = everything_1["idb://".concat(db.name, "/").concat(table.name, "/:dels")] = new RangeSet(-Infinity, [[[]]]);
		              });
		              globalEvents(DEXIE_STORAGE_MUTATED_EVENT_NAME).fire(everything_1);
		              signalSubscribersNow(everything_1, true);
		          }
		          return db;
		      });
		  }

		  function awaitIterator(iterator) {
		      var callNext = function (result) { return iterator.next(result); }, doThrow = function (error) { return iterator.throw(error); }, onSuccess = step(callNext), onError = step(doThrow);
		      function step(getNext) {
		          return function (val) {
		              var next = getNext(val), value = next.value;
		              return next.done
		                  ? value
		                  : !value || typeof value.then !== 'function'
		                      ? isArray(value)
		                          ? Promise.all(value).then(onSuccess, onError)
		                          : onSuccess(value)
		                      : value.then(onSuccess, onError);
		          };
		      }
		      return step(callNext)();
		  }

		  function extractTransactionArgs(mode, _tableArgs_, scopeFunc) {
		      var i = arguments.length;
		      if (i < 2)
		          throw new exceptions.InvalidArgument('Too few arguments');
		      var args = new Array(i - 1);
		      while (--i)
		          args[i - 1] = arguments[i];
		      scopeFunc = args.pop();
		      var tables = flatten(args);
		      return [mode, tables, scopeFunc];
		  }
		  function enterTransactionScope(db, mode, storeNames, parentTransaction, scopeFunc) {
		      return DexiePromise.resolve().then(function () {
		          var transless = PSD.transless || PSD;
		          var trans = db._createTransaction(mode, storeNames, db._dbSchema, parentTransaction);
		          trans.explicit = true;
		          var zoneProps = {
		              trans: trans,
		              transless: transless,
		          };
		          if (parentTransaction) {
		              trans.idbtrans = parentTransaction.idbtrans;
		          }
		          else {
		              try {
		                  trans.create();
		                  trans.idbtrans._explicit = true;
		                  db._state.PR1398_maxLoop = 3;
		              }
		              catch (ex) {
		                  if (ex.name === errnames.InvalidState &&
		                      db.isOpen() &&
		                      --db._state.PR1398_maxLoop > 0) {
		                      console.warn('Dexie: Need to reopen db');
		                      db.close({ disableAutoOpen: false });
		                      return db
		                          .open()
		                          .then(function () {
		                          return enterTransactionScope(db, mode, storeNames, null, scopeFunc);
		                      });
		                  }
		                  return rejection(ex);
		              }
		          }
		          var scopeFuncIsAsync = isAsyncFunction(scopeFunc);
		          if (scopeFuncIsAsync) {
		              incrementExpectedAwaits();
		          }
		          var returnValue;
		          var promiseFollowed = DexiePromise.follow(function () {
		              returnValue = scopeFunc.call(trans, trans);
		              if (returnValue) {
		                  if (scopeFuncIsAsync) {
		                      var decrementor = decrementExpectedAwaits.bind(null, null);
		                      returnValue.then(decrementor, decrementor);
		                  }
		                  else if (typeof returnValue.next === 'function' &&
		                      typeof returnValue.throw === 'function') {
		                      returnValue = awaitIterator(returnValue);
		                  }
		              }
		          }, zoneProps);
		          return (returnValue && typeof returnValue.then === 'function'
		              ?
		                  DexiePromise.resolve(returnValue).then(function (x) {
		                      return trans.active
		                          ? x
		                          : rejection(new exceptions.PrematureCommit('Transaction committed too early. See http://bit.ly/2kdckMn'));
		                  })
		              :
		                  promiseFollowed.then(function () { return returnValue; }))
		              .then(function (x) {
		              if (parentTransaction)
		                  trans._resolve();
		              return trans._completion.then(function () { return x; });
		          })
		              .catch(function (e) {
		              trans._reject(e);
		              return rejection(e);
		          });
		      });
		  }

		  function pad(a, value, count) {
		      var result = isArray(a) ? a.slice() : [a];
		      for (var i = 0; i < count; ++i)
		          result.push(value);
		      return result;
		  }
		  function createVirtualIndexMiddleware(down) {
		      return __assign(__assign({}, down), { table: function (tableName) {
		              var table = down.table(tableName);
		              var schema = table.schema;
		              var indexLookup = Object.create(null);
		              var allVirtualIndexes = [];
		              function addVirtualIndexes(keyPath, keyTail, lowLevelIndex) {
		                  var keyPathAlias = getKeyPathAlias(keyPath);
		                  var indexList = (indexLookup[keyPathAlias] =
		                      indexLookup[keyPathAlias] || []);
		                  var keyLength = keyPath == null
		                      ? 0
		                      : typeof keyPath === 'string'
		                          ? 1
		                          : keyPath.length;
		                  var isVirtual = keyTail > 0;
		                  var virtualIndex = __assign(__assign({}, lowLevelIndex), { name: isVirtual
		                          ? "".concat(keyPathAlias, "(virtual-from:").concat(lowLevelIndex.name, ")")
		                          : lowLevelIndex.name, lowLevelIndex: lowLevelIndex, isVirtual: isVirtual, keyTail: keyTail, keyLength: keyLength, extractKey: getKeyExtractor(keyPath), unique: !isVirtual && lowLevelIndex.unique });
		                  indexList.push(virtualIndex);
		                  if (!virtualIndex.isPrimaryKey) {
		                      allVirtualIndexes.push(virtualIndex);
		                  }
		                  if (keyLength > 1) {
		                      var virtualKeyPath = keyLength === 2
		                          ? keyPath[0]
		                          : keyPath.slice(0, keyLength - 1);
		                      addVirtualIndexes(virtualKeyPath, keyTail + 1, lowLevelIndex);
		                  }
		                  indexList.sort(function (a, b) { return a.keyTail - b.keyTail; });
		                  return virtualIndex;
		              }
		              var primaryKey = addVirtualIndexes(schema.primaryKey.keyPath, 0, schema.primaryKey);
		              indexLookup[':id'] = [primaryKey];
		              for (var _i = 0, _a = schema.indexes; _i < _a.length; _i++) {
		                  var index = _a[_i];
		                  addVirtualIndexes(index.keyPath, 0, index);
		              }
		              function findBestIndex(keyPath) {
		                  var result = indexLookup[getKeyPathAlias(keyPath)];
		                  return result && result[0];
		              }
		              function translateRange(range, keyTail) {
		                  return {
		                      type: range.type === 1
		                          ? 2
		                          : range.type,
		                      lower: pad(range.lower, range.lowerOpen ? down.MAX_KEY : down.MIN_KEY, keyTail),
		                      lowerOpen: true,
		                      upper: pad(range.upper, range.upperOpen ? down.MIN_KEY : down.MAX_KEY, keyTail),
		                      upperOpen: true,
		                  };
		              }
		              function translateRequest(req) {
		                  var index = req.query.index;
		                  return index.isVirtual
		                      ? __assign(__assign({}, req), { query: {
		                              index: index.lowLevelIndex,
		                              range: translateRange(req.query.range, index.keyTail),
		                          } }) : req;
		              }
		              var result = __assign(__assign({}, table), { schema: __assign(__assign({}, schema), { primaryKey: primaryKey, indexes: allVirtualIndexes, getIndexByKeyPath: findBestIndex }), count: function (req) {
		                      return table.count(translateRequest(req));
		                  }, query: function (req) {
		                      return table.query(translateRequest(req));
		                  }, openCursor: function (req) {
		                      var _a = req.query
		                          .index, keyTail = _a.keyTail, isVirtual = _a.isVirtual, keyLength = _a.keyLength;
		                      if (!isVirtual)
		                          return table.openCursor(req);
		                      function createVirtualCursor(cursor) {
		                          function _continue(key) {
		                              key != null
		                                  ? cursor.continue(pad(key, req.reverse ? down.MAX_KEY : down.MIN_KEY, keyTail))
		                                  : req.unique
		                                      ? cursor.continue(cursor.key
		                                          .slice(0, keyLength)
		                                          .concat(req.reverse ? down.MIN_KEY : down.MAX_KEY, keyTail))
		                                      : cursor.continue();
		                          }
		                          var virtualCursor = Object.create(cursor, {
		                              continue: { value: _continue },
		                              continuePrimaryKey: {
		                                  value: function (key, primaryKey) {
		                                      cursor.continuePrimaryKey(pad(key, down.MAX_KEY, keyTail), primaryKey);
		                                  },
		                              },
		                              primaryKey: {
		                                  get: function () {
		                                      return cursor.primaryKey;
		                                  },
		                              },
		                              key: {
		                                  get: function () {
		                                      var key = cursor.key;
		                                      return keyLength === 1
		                                          ? key[0]
		                                          : key.slice(0, keyLength);
		                                  },
		                              },
		                              value: {
		                                  get: function () {
		                                      return cursor.value;
		                                  },
		                              },
		                          });
		                          return virtualCursor;
		                      }
		                      return table
		                          .openCursor(translateRequest(req))
		                          .then(function (cursor) { return cursor && createVirtualCursor(cursor); });
		                  } });
		              return result;
		          } });
		  }
		  var virtualIndexMiddleware = {
		      stack: 'dbcore',
		      name: 'VirtualIndexMiddleware',
		      level: 1,
		      create: createVirtualIndexMiddleware,
		  };

		  function getObjectDiff(a, b, rv, prfx) {
		      rv = rv || {};
		      prfx = prfx || '';
		      keys(a).forEach(function (prop) {
		          if (!hasOwn(b, prop)) {
		              rv[prfx + prop] = undefined;
		          }
		          else {
		              var ap = a[prop], bp = b[prop];
		              if (typeof ap === 'object' && typeof bp === 'object' && ap && bp) {
		                  var apTypeName = toStringTag(ap);
		                  var bpTypeName = toStringTag(bp);
		                  if (apTypeName !== bpTypeName) {
		                      rv[prfx + prop] = b[prop];
		                  }
		                  else if (apTypeName === 'Object') {
		                      getObjectDiff(ap, bp, rv, prfx + prop + '.');
		                  }
		                  else if (ap !== bp) {
		                      rv[prfx + prop] = b[prop];
		                  }
		              }
		              else if (ap !== bp)
		                  rv[prfx + prop] = b[prop];
		          }
		      });
		      keys(b).forEach(function (prop) {
		          if (!hasOwn(a, prop)) {
		              rv[prfx + prop] = b[prop];
		          }
		      });
		      return rv;
		  }

		  function getEffectiveKeys(primaryKey, req) {
		      if (req.type === 'delete')
		          return req.keys;
		      return req.keys || req.values.map(primaryKey.extractKey);
		  }

		  var hooksMiddleware = {
		      stack: 'dbcore',
		      name: 'HooksMiddleware',
		      level: 2,
		      create: function (downCore) {
		          return (__assign(__assign({}, downCore), { table: function (tableName) {
		                  var downTable = downCore.table(tableName);
		                  var primaryKey = downTable.schema.primaryKey;
		                  var tableMiddleware = __assign(__assign({}, downTable), { mutate: function (req) {
		                          var dxTrans = PSD.trans;
		                          var _a = dxTrans.table(tableName).hook, deleting = _a.deleting, creating = _a.creating, updating = _a.updating;
		                          switch (req.type) {
		                              case 'add':
		                                  if (creating.fire === nop)
		                                      break;
		                                  return dxTrans._promise('readwrite', function () { return addPutOrDelete(req); }, true);
		                              case 'put':
		                                  if (creating.fire === nop && updating.fire === nop)
		                                      break;
		                                  return dxTrans._promise('readwrite', function () { return addPutOrDelete(req); }, true);
		                              case 'delete':
		                                  if (deleting.fire === nop)
		                                      break;
		                                  return dxTrans._promise('readwrite', function () { return addPutOrDelete(req); }, true);
		                              case 'deleteRange':
		                                  if (deleting.fire === nop)
		                                      break;
		                                  return dxTrans._promise('readwrite', function () { return deleteRange(req); }, true);
		                          }
		                          return downTable.mutate(req);
		                          function addPutOrDelete(req) {
		                              var dxTrans = PSD.trans;
		                              var keys = req.keys || getEffectiveKeys(primaryKey, req);
		                              if (!keys)
		                                  throw new Error('Keys missing');
		                              req =
		                                  req.type === 'add' || req.type === 'put'
		                                      ? __assign(__assign({}, req), { keys: keys }) : __assign({}, req);
		                              if (req.type !== 'delete')
		                                  req.values = __spreadArray([], req.values);
		                              if (req.keys)
		                                  req.keys = __spreadArray([], req.keys);
		                              return getExistingValues(downTable, req, keys).then(function (existingValues) {
		                                  var contexts = keys.map(function (key, i) {
		                                      var existingValue = existingValues[i];
		                                      var ctx = { onerror: null, onsuccess: null };
		                                      if (req.type === 'delete') {
		                                          deleting.fire.call(ctx, key, existingValue, dxTrans);
		                                      }
		                                      else if (req.type === 'add' ||
		                                          existingValue === undefined) {
		                                          var generatedPrimaryKey = creating.fire.call(ctx, key, req.values[i], dxTrans);
		                                          if (key == null && generatedPrimaryKey != null) {
		                                              key = generatedPrimaryKey;
		                                              req.keys[i] = key;
		                                              if (!primaryKey.outbound) {
		                                                  setByKeyPath(req.values[i], primaryKey.keyPath, key);
		                                              }
		                                          }
		                                      }
		                                      else {
		                                          var objectDiff = getObjectDiff(existingValue, req.values[i]);
		                                          var additionalChanges_1 = updating.fire.call(ctx, objectDiff, key, existingValue, dxTrans);
		                                          if (additionalChanges_1) {
		                                              var requestedValue_1 = req.values[i];
		                                              Object.keys(additionalChanges_1).forEach(function (keyPath) {
		                                                  if (hasOwn(requestedValue_1, keyPath)) {
		                                                      requestedValue_1[keyPath] =
		                                                          additionalChanges_1[keyPath];
		                                                  }
		                                                  else {
		                                                      setByKeyPath(requestedValue_1, keyPath, additionalChanges_1[keyPath]);
		                                                  }
		                                              });
		                                          }
		                                      }
		                                      return ctx;
		                                  });
		                                  return downTable
		                                      .mutate(req)
		                                      .then(function (_a) {
		                                      var failures = _a.failures, results = _a.results, numFailures = _a.numFailures, lastResult = _a.lastResult;
		                                      for (var i = 0; i < keys.length; ++i) {
		                                          var primKey = results ? results[i] : keys[i];
		                                          var ctx = contexts[i];
		                                          if (primKey == null) {
		                                              ctx.onerror && ctx.onerror(failures[i]);
		                                          }
		                                          else {
		                                              ctx.onsuccess &&
		                                                  ctx.onsuccess(req.type === 'put' && existingValues[i]
		                                                      ? req.values[i]
		                                                      : primKey
		                                                  );
		                                          }
		                                      }
		                                      return { failures: failures, results: results, numFailures: numFailures, lastResult: lastResult };
		                                  })
		                                      .catch(function (error) {
		                                      contexts.forEach(function (ctx) { return ctx.onerror && ctx.onerror(error); });
		                                      return Promise.reject(error);
		                                  });
		                              });
		                          }
		                          function deleteRange(req) {
		                              return deleteNextChunk(req.trans, req.range, 10000);
		                          }
		                          function deleteNextChunk(trans, range, limit) {
		                              return downTable
		                                  .query({
		                                  trans: trans,
		                                  values: false,
		                                  query: { index: primaryKey, range: range },
		                                  limit: limit,
		                              })
		                                  .then(function (_a) {
		                                  var result = _a.result;
		                                  return addPutOrDelete({
		                                      type: 'delete',
		                                      keys: result,
		                                      trans: trans,
		                                  }).then(function (res) {
		                                      if (res.numFailures > 0)
		                                          return Promise.reject(res.failures[0]);
		                                      if (result.length < limit) {
		                                          return {
		                                              failures: [],
		                                              numFailures: 0,
		                                              lastResult: undefined,
		                                          };
		                                      }
		                                      else {
		                                          return deleteNextChunk(trans, __assign(__assign({}, range), { lower: result[result.length - 1], lowerOpen: true }), limit);
		                                      }
		                                  });
		                              });
		                          }
		                      } });
		                  return tableMiddleware;
		              } }));
		      },
		  };
		  function getExistingValues(table, req, effectiveKeys) {
		      return req.type === 'add'
		          ? Promise.resolve([])
		          : table.getMany({
		              trans: req.trans,
		              keys: effectiveKeys,
		              cache: 'immutable',
		          });
		  }

		  function getFromTransactionCache(keys, cache, clone) {
		      try {
		          if (!cache)
		              return null;
		          if (cache.keys.length < keys.length)
		              return null;
		          var result = [];
		          for (var i = 0, j = 0; i < cache.keys.length && j < keys.length; ++i) {
		              if (cmp(cache.keys[i], keys[j]) !== 0)
		                  continue;
		              result.push(clone ? deepClone(cache.values[i]) : cache.values[i]);
		              ++j;
		          }
		          return result.length === keys.length ? result : null;
		      }
		      catch (_a) {
		          return null;
		      }
		  }
		  var cacheExistingValuesMiddleware = {
		      stack: 'dbcore',
		      level: -1,
		      create: function (core) {
		          return {
		              table: function (tableName) {
		                  var table = core.table(tableName);
		                  return __assign(__assign({}, table), { getMany: function (req) {
		                          if (!req.cache) {
		                              return table.getMany(req);
		                          }
		                          var cachedResult = getFromTransactionCache(req.keys, req.trans['_cache'], req.cache === 'clone');
		                          if (cachedResult) {
		                              return DexiePromise.resolve(cachedResult);
		                          }
		                          return table.getMany(req).then(function (res) {
		                              req.trans['_cache'] = {
		                                  keys: req.keys,
		                                  values: req.cache === 'clone' ? deepClone(res) : res,
		                              };
		                              return res;
		                          });
		                      }, mutate: function (req) {
		                          if (req.type !== 'add')
		                              req.trans['_cache'] = null;
		                          return table.mutate(req);
		                      } });
		              },
		          };
		      },
		  };

		  function isCachableContext(ctx, table) {
		      return (ctx.trans.mode === 'readonly' &&
		          !!ctx.subscr &&
		          !ctx.trans.explicit &&
		          ctx.trans.db._options.cache !== 'disabled' &&
		          !table.schema.primaryKey.outbound);
		  }

		  function isCachableRequest(type, req) {
		      switch (type) {
		          case 'query':
		              return req.values && !req.unique;
		          case 'get':
		              return false;
		          case 'getMany':
		              return false;
		          case 'count':
		              return false;
		          case 'openCursor':
		              return false;
		      }
		  }

		  var observabilityMiddleware = {
		      stack: 'dbcore',
		      level: 0,
		      name: 'Observability',
		      create: function (core) {
		          var dbName = core.schema.name;
		          var FULL_RANGE = new RangeSet(core.MIN_KEY, core.MAX_KEY);
		          return __assign(__assign({}, core), { transaction: function (stores, mode, options) {
		                  if (PSD.subscr && mode !== 'readonly') {
		                      throw new exceptions.ReadOnly("Readwrite transaction in liveQuery context. Querier source: ".concat(PSD.querier));
		                  }
		                  return core.transaction(stores, mode, options);
		              }, table: function (tableName) {
		                  var table = core.table(tableName);
		                  var schema = table.schema;
		                  var primaryKey = schema.primaryKey, indexes = schema.indexes;
		                  var extractKey = primaryKey.extractKey, outbound = primaryKey.outbound;
		                  var indexesWithAutoIncPK = primaryKey.autoIncrement &&
		                      indexes.filter(function (index) {
		                          return index.compound &&
		                              index.keyPath.includes(primaryKey.keyPath);
		                      });
		                  var tableClone = __assign(__assign({}, table), { mutate: function (req) {
		                          var _a, _b;
		                          var trans = req.trans;
		                          var mutatedParts = req.mutatedParts || (req.mutatedParts = {});
		                          var getRangeSet = function (indexName) {
		                              var part = "idb://".concat(dbName, "/").concat(tableName, "/").concat(indexName);
		                              return (mutatedParts[part] ||
		                                  (mutatedParts[part] = new RangeSet()));
		                          };
		                          var pkRangeSet = getRangeSet('');
		                          var delsRangeSet = getRangeSet(':dels');
		                          var type = req.type;
		                          var _c = req.type === 'deleteRange'
		                              ? [req.range]
		                              : req.type === 'delete'
		                                  ? [req.keys]
		                                  : req.values.length < 50
		                                      ? [
		                                          getEffectiveKeys(primaryKey, req).filter(function (id) { return id; }),
		                                          req.values,
		                                      ]
		                                      : [], keys = _c[0], newObjs = _c[1];
		                          var oldCache = req.trans['_cache'];
		                          if (isArray(keys)) {
		                              pkRangeSet.addKeys(keys);
		                              var oldObjs = type === 'delete' || keys.length === newObjs.length
		                                  ? getFromTransactionCache(keys, oldCache)
		                                  : null;
		                              if (!oldObjs) {
		                                  delsRangeSet.addKeys(keys);
		                              }
		                              if (oldObjs || newObjs) {
		                                  trackAffectedIndexes(getRangeSet, schema, oldObjs, newObjs);
		                              }
		                          }
		                          else if (keys) {
		                              var range = {
		                                  from: (_a = keys.lower) !== null && _a !== void 0 ? _a : core.MIN_KEY,
		                                  to: (_b = keys.upper) !== null && _b !== void 0 ? _b : core.MAX_KEY,
		                              };
		                              delsRangeSet.add(range);
		                              pkRangeSet.add(range);
		                          }
		                          else {
		                              pkRangeSet.add(FULL_RANGE);
		                              delsRangeSet.add(FULL_RANGE);
		                              schema.indexes.forEach(function (idx) {
		                                  return getRangeSet(idx.name).add(FULL_RANGE);
		                              });
		                          }
		                          return table.mutate(req).then(function (res) {
		                              if (keys && (req.type === 'add' || req.type === 'put')) {
		                                  pkRangeSet.addKeys(res.results);
		                                  if (indexesWithAutoIncPK) {
		                                      indexesWithAutoIncPK.forEach(function (idx) {
		                                          var idxVals = req.values.map(function (v) { return idx.extractKey(v); });
		                                          var pkPos = idx.keyPath.findIndex(function (prop) { return prop === primaryKey.keyPath; });
		                                          for (var i = 0, len = res.results.length; i < len; ++i) {
		                                              idxVals[i][pkPos] = res.results[i];
		                                          }
		                                          getRangeSet(idx.name).addKeys(idxVals);
		                                      });
		                                  }
		                              }
		                              trans.mutatedParts = extendObservabilitySet(trans.mutatedParts || {}, mutatedParts);
		                              return res;
		                          });
		                      } });
		                  var getRange = function (_a) {
		                      var _b, _c;
		                      var _d = _a.query, index = _d.index, range = _d.range;
		                      return [
		                          index,
		                          new RangeSet((_b = range.lower) !== null && _b !== void 0 ? _b : core.MIN_KEY, (_c = range.upper) !== null && _c !== void 0 ? _c : core.MAX_KEY),
		                      ];
		                  };
		                  var readSubscribers = {
		                      get: function (req) { return [primaryKey, new RangeSet(req.key)]; },
		                      getMany: function (req) { return [primaryKey, new RangeSet().addKeys(req.keys)]; },
		                      count: getRange,
		                      query: getRange,
		                      openCursor: getRange,
		                  };
		                  keys(readSubscribers).forEach(function (method) {
		                      tableClone[method] = function (req) {
		                          var subscr = PSD.subscr;
		                          var isLiveQuery = !!subscr;
		                          var cachable = isCachableContext(PSD, table) &&
		                              isCachableRequest(method, req);
		                          var obsSet = cachable
		                              ? (req.obsSet = {})
		                              : subscr;
		                          if (isLiveQuery) {
		                              var getRangeSet = function (indexName) {
		                                  var part = "idb://".concat(dbName, "/").concat(tableName, "/").concat(indexName);
		                                  return (obsSet[part] ||
		                                      (obsSet[part] = new RangeSet()));
		                              };
		                              var pkRangeSet_1 = getRangeSet('');
		                              var delsRangeSet_1 = getRangeSet(':dels');
		                              var _a = readSubscribers[method](req), queriedIndex = _a[0], queriedRanges = _a[1];
		                              if (method === 'query' &&
		                                  queriedIndex.isPrimaryKey &&
		                                  !req.values) {
		                                  delsRangeSet_1.add(queriedRanges);
		                              }
		                              else {
		                                  getRangeSet(queriedIndex.name || '').add(queriedRanges);
		                              }
		                              if (!queriedIndex.isPrimaryKey) {
		                                  if (method === 'count') {
		                                      delsRangeSet_1.add(FULL_RANGE);
		                                  }
		                                  else {
		                                      var keysPromise_1 = method === 'query' &&
		                                          outbound &&
		                                          req.values &&
		                                          table.query(__assign(__assign({}, req), { values: false }));
		                                      return table[method].apply(this, arguments).then(function (res) {
		                                          if (method === 'query') {
		                                              if (outbound && req.values) {
		                                                  return keysPromise_1.then(function (_a) {
		                                                      var resultingKeys = _a.result;
		                                                      pkRangeSet_1.addKeys(resultingKeys);
		                                                      return res;
		                                                  });
		                                              }
		                                              var pKeys = req.values
		                                                  ? res.result.map(extractKey)
		                                                  : res.result;
		                                              if (req.values) {
		                                                  pkRangeSet_1.addKeys(pKeys);
		                                              }
		                                              else {
		                                                  delsRangeSet_1.addKeys(pKeys);
		                                              }
		                                          }
		                                          else if (method === 'openCursor') {
		                                              var cursor_1 = res;
		                                              var wantValues_1 = req
		                                                  .values;
		                                              return (cursor_1 &&
		                                                  Object.create(cursor_1, {
		                                                      key: {
		                                                          get: function () {
		                                                              delsRangeSet_1.addKey(cursor_1.primaryKey);
		                                                              return cursor_1.key;
		                                                          },
		                                                      },
		                                                      primaryKey: {
		                                                          get: function () {
		                                                              var pkey = cursor_1.primaryKey;
		                                                              delsRangeSet_1.addKey(pkey);
		                                                              return pkey;
		                                                          },
		                                                      },
		                                                      value: {
		                                                          get: function () {
		                                                              wantValues_1 &&
		                                                                  pkRangeSet_1.addKey(cursor_1.primaryKey);
		                                                              return cursor_1.value;
		                                                          },
		                                                      },
		                                                  }));
		                                          }
		                                          return res;
		                                      });
		                                  }
		                              }
		                          }
		                          return table[method].apply(this, arguments);
		                      };
		                  });
		                  return tableClone;
		              } });
		      },
		  };
		  function trackAffectedIndexes(getRangeSet, schema, oldObjs, newObjs) {
		      function addAffectedIndex(ix) {
		          var rangeSet = getRangeSet(ix.name || '');
		          function extractKey(obj) {
		              return obj != null ? ix.extractKey(obj) : null;
		          }
		          var addKeyOrKeys = function (key) {
		              return ix.multiEntry && isArray(key)
		                  ?
		                      key.forEach(function (key) { return rangeSet.addKey(key); })
		                  :
		                      rangeSet.addKey(key);
		          };
		          (oldObjs || newObjs).forEach(function (_, i) {
		              var oldKey = oldObjs && extractKey(oldObjs[i]);
		              var newKey = newObjs && extractKey(newObjs[i]);
		              if (cmp(oldKey, newKey) !== 0) {
		                  if (oldKey != null)
		                      addKeyOrKeys(oldKey);
		                  if (newKey != null)
		                      addKeyOrKeys(newKey);
		              }
		          });
		      }
		      schema.indexes.forEach(addAffectedIndex);
		  }

		  function adjustOptimisticFromFailures(tblCache, req, res) {
		      if (res.numFailures === 0)
		          return req;
		      if (req.type === 'deleteRange') {
		          return null;
		      }
		      var numBulkOps = req.keys
		          ? req.keys.length
		          : 'values' in req && req.values
		              ? req.values.length
		              : 1;
		      if (res.numFailures === numBulkOps) {
		          return null;
		      }
		      var clone = __assign({}, req);
		      if (isArray(clone.keys)) {
		          clone.keys = clone.keys.filter(function (_, i) { return !(i in res.failures); });
		      }
		      if ('values' in clone && isArray(clone.values)) {
		          clone.values = clone.values.filter(function (_, i) { return !(i in res.failures); });
		      }
		      return clone;
		  }

		  function isAboveLower(key, range) {
		      return range.lower === undefined
		          ? true
		          : range.lowerOpen
		              ? cmp(key, range.lower) > 0
		              : cmp(key, range.lower) >= 0;
		  }
		  function isBelowUpper(key, range) {
		      return range.upper === undefined
		          ? true
		          : range.upperOpen
		              ? cmp(key, range.upper) < 0
		              : cmp(key, range.upper) <= 0;
		  }
		  function isWithinRange(key, range) {
		      return isAboveLower(key, range) && isBelowUpper(key, range);
		  }

		  function applyOptimisticOps(result, req, ops, table, cacheEntry, immutable) {
		      if (!ops || ops.length === 0)
		          return result;
		      var index = req.query.index;
		      var multiEntry = index.multiEntry;
		      var queryRange = req.query.range;
		      var primaryKey = table.schema.primaryKey;
		      var extractPrimKey = primaryKey.extractKey;
		      var extractIndex = index.extractKey;
		      var extractLowLevelIndex = (index.lowLevelIndex || index).extractKey;
		      var finalResult = ops.reduce(function (result, op) {
		          var modifedResult = result;
		          var includedValues = [];
		          if (op.type === 'add' || op.type === 'put') {
		              var includedPKs = new RangeSet();
		              for (var i = op.values.length - 1; i >= 0; --i) {
		                  var value = op.values[i];
		                  var pk = extractPrimKey(value);
		                  if (includedPKs.hasKey(pk))
		                      continue;
		                  var key = extractIndex(value);
		                  if (multiEntry && isArray(key)
		                      ? key.some(function (k) { return isWithinRange(k, queryRange); })
		                      : isWithinRange(key, queryRange)) {
		                      includedPKs.addKey(pk);
		                      includedValues.push(value);
		                  }
		              }
		          }
		          switch (op.type) {
		              case 'add': {
		                  var existingKeys_1 = new RangeSet().addKeys(req.values ? result.map(function (v) { return extractPrimKey(v); }) : result);
		                  modifedResult = result.concat(req.values
		                      ? includedValues.filter(function (v) {
		                          var key = extractPrimKey(v);
		                          if (existingKeys_1.hasKey(key))
		                              return false;
		                          existingKeys_1.addKey(key);
		                          return true;
		                      })
		                      : includedValues
		                          .map(function (v) { return extractPrimKey(v); })
		                          .filter(function (k) {
		                          if (existingKeys_1.hasKey(k))
		                              return false;
		                          existingKeys_1.addKey(k);
		                          return true;
		                      }));
		                  break;
		              }
		              case 'put': {
		                  var keySet_1 = new RangeSet().addKeys(op.values.map(function (v) { return extractPrimKey(v); }));
		                  modifedResult = result
		                      .filter(
		                  function (item) { return !keySet_1.hasKey(req.values ? extractPrimKey(item) : item); })
		                      .concat(
		                  req.values
		                      ? includedValues
		                      : includedValues.map(function (v) { return extractPrimKey(v); }));
		                  break;
		              }
		              case 'delete':
		                  var keysToDelete_1 = new RangeSet().addKeys(op.keys);
		                  modifedResult = result.filter(function (item) {
		                      return !keysToDelete_1.hasKey(req.values ? extractPrimKey(item) : item);
		                  });
		                  break;
		              case 'deleteRange':
		                  var range_1 = op.range;
		                  modifedResult = result.filter(function (item) { return !isWithinRange(extractPrimKey(item), range_1); });
		                  break;
		          }
		          return modifedResult;
		      }, result);
		      if (finalResult === result)
		          return result;
		      var sorter = function (a, b) {
		          return cmp(extractLowLevelIndex(a), extractLowLevelIndex(b)) ||
		              cmp(extractPrimKey(a), extractPrimKey(b));
		      };
		      finalResult.sort(req.direction === 'prev' || req.direction === 'prevunique'
		          ? function (a, b) { return sorter(b, a); }
		          : sorter);
		      if (req.limit && req.limit < Infinity) {
		          if (finalResult.length > req.limit) {
		              finalResult.length = req.limit;
		          }
		          else if (result.length === req.limit && finalResult.length < req.limit) {
		              cacheEntry.dirty = true;
		          }
		      }
		      return immutable ? Object.freeze(finalResult) : finalResult;
		  }

		  function areRangesEqual(r1, r2) {
		      return (cmp(r1.lower, r2.lower) === 0 &&
		          cmp(r1.upper, r2.upper) === 0 &&
		          !!r1.lowerOpen === !!r2.lowerOpen &&
		          !!r1.upperOpen === !!r2.upperOpen);
		  }

		  function compareLowers(lower1, lower2, lowerOpen1, lowerOpen2) {
		      if (lower1 === undefined)
		          return lower2 !== undefined ? -1 : 0;
		      if (lower2 === undefined)
		          return 1;
		      var c = cmp(lower1, lower2);
		      if (c === 0) {
		          if (lowerOpen1 && lowerOpen2)
		              return 0;
		          if (lowerOpen1)
		              return 1;
		          if (lowerOpen2)
		              return -1;
		      }
		      return c;
		  }
		  function compareUppers(upper1, upper2, upperOpen1, upperOpen2) {
		      if (upper1 === undefined)
		          return upper2 !== undefined ? 1 : 0;
		      if (upper2 === undefined)
		          return -1;
		      var c = cmp(upper1, upper2);
		      if (c === 0) {
		          if (upperOpen1 && upperOpen2)
		              return 0;
		          if (upperOpen1)
		              return -1;
		          if (upperOpen2)
		              return 1;
		      }
		      return c;
		  }
		  function isSuperRange(r1, r2) {
		      return (compareLowers(r1.lower, r2.lower, r1.lowerOpen, r2.lowerOpen) <= 0 &&
		          compareUppers(r1.upper, r2.upper, r1.upperOpen, r2.upperOpen) >= 0);
		  }

		  function findCompatibleQuery(dbName, tableName, type, req) {
		      var _a;
		      var tblCache = cache["idb://".concat(dbName, "/").concat(tableName)];
		      if (!tblCache)
		          return [];
		      var queries = tblCache.queries[type];
		      if (!queries)
		          return [null, false, tblCache, null];
		      var indexName = req.query ? req.query.index.name : null;
		      var entries = queries[indexName || ''];
		      if (!entries)
		          return [null, false, tblCache, null];
		      switch (type) {
		          case 'query':
		              var reqDirection_1 = (_a = req.direction) !== null && _a !== void 0 ? _a : 'next';
		              var equalEntry = entries.find(function (entry) {
		                  var _a;
		                  return entry.req.limit === req.limit &&
		                      entry.req.values === req.values &&
		                      ((_a = entry.req.direction) !== null && _a !== void 0 ? _a : 'next') ===
		                          reqDirection_1 &&
		                      areRangesEqual(entry.req.query.range, req.query.range);
		              });
		              if (equalEntry)
		                  return [
		                      equalEntry,
		                      true,
		                      tblCache,
		                      entries,
		                  ];
		              var superEntry = entries.find(function (entry) {
		                  var _a;
		                  var limit = 'limit' in entry.req ? entry.req.limit : Infinity;
		                  return (limit >= req.limit &&
		                      ((_a = entry.req.direction) !== null && _a !== void 0 ? _a : 'next') ===
		                          reqDirection_1 &&
		                      (req.values ? entry.req.values : true) &&
		                      isSuperRange(entry.req.query.range, req.query.range));
		              });
		              return [superEntry, false, tblCache, entries];
		          case 'count':
		              var countQuery = entries.find(function (entry) {
		                  return areRangesEqual(entry.req.query.range, req.query.range);
		              });
		              return [countQuery, !!countQuery, tblCache, entries];
		      }
		  }

		  function subscribeToCacheEntry(cacheEntry, container, requery, signal) {
		      cacheEntry.subscribers.add(requery);
		      signal.addEventListener('abort', function () {
		          cacheEntry.subscribers.delete(requery);
		          if (cacheEntry.subscribers.size === 0) {
		              enqueForDeletion(cacheEntry, container);
		          }
		      });
		  }
		  function enqueForDeletion(cacheEntry, container) {
		      setTimeout(function () {
		          if (cacheEntry.subscribers.size === 0) {
		              delArrayItem(container, cacheEntry);
		          }
		      }, 3000);
		  }

		  var cacheMiddleware = {
		      stack: 'dbcore',
		      level: 0,
		      name: 'Cache',
		      create: function (core) {
		          var dbName = core.schema.name;
		          var coreMW = __assign(__assign({}, core), { transaction: function (stores, mode, options) {
		                  var idbtrans = core.transaction(stores, mode, options);
		                  if (mode === 'readwrite') {
		                      var ac_1 = new AbortController();
		                      var signal = ac_1.signal;
		                      var endTransaction = function (wasCommitted) { return function () {
		                          ac_1.abort();
		                          if (mode === 'readwrite') {
		                              var affectedSubscribers_1 = new Set();
		                              for (var _i = 0, stores_1 = stores; _i < stores_1.length; _i++) {
		                                  var storeName = stores_1[_i];
		                                  var tblCache = cache["idb://".concat(dbName, "/").concat(storeName)];
		                                  if (tblCache) {
		                                      var table = core.table(storeName);
		                                      var ops = tblCache.optimisticOps.filter(function (op) { return op.trans === idbtrans; });
		                                      if (idbtrans._explicit &&
		                                          wasCommitted &&
		                                          idbtrans.mutatedParts) {
		                                          for (var _a = 0, _b = Object.values(tblCache.queries.query); _a < _b.length; _a++) {
		                                              var entries = _b[_a];
		                                              for (var _c = 0, _d = entries.slice(); _c < _d.length; _c++) {
		                                                  var entry = _d[_c];
		                                                  if (obsSetsOverlap(entry.obsSet, idbtrans.mutatedParts)) {
		                                                      delArrayItem(entries, entry);
		                                                      entry.subscribers.forEach(function (requery) {
		                                                          return affectedSubscribers_1.add(requery);
		                                                      });
		                                                  }
		                                              }
		                                          }
		                                      }
		                                      else if (ops.length > 0) {
		                                          tblCache.optimisticOps = tblCache.optimisticOps.filter(function (op) { return op.trans !== idbtrans; });
		                                          for (var _e = 0, _f = Object.values(tblCache.queries.query); _e < _f.length; _e++) {
		                                              var entries = _f[_e];
		                                              for (var _g = 0, _h = entries.slice(); _g < _h.length; _g++) {
		                                                  var entry = _h[_g];
		                                                  if (entry.res != null &&
		                                                      idbtrans.mutatedParts
		  ) {
		                                                      if (wasCommitted && !entry.dirty) {
		                                                          var freezeResults = Object.isFrozen(entry.res);
		                                                          var modRes = applyOptimisticOps(entry.res, entry.req, ops, table, entry, freezeResults);
		                                                          if (entry.dirty) {
		                                                              delArrayItem(entries, entry);
		                                                              entry.subscribers.forEach(function (requery) {
		                                                                  return affectedSubscribers_1.add(requery);
		                                                              });
		                                                          }
		                                                          else if (modRes !== entry.res) {
		                                                              entry.res = modRes;
		                                                              entry.promise = DexiePromise.resolve({
		                                                                  result: modRes,
		                                                              });
		                                                          }
		                                                      }
		                                                      else {
		                                                          if (entry.dirty) {
		                                                              delArrayItem(entries, entry);
		                                                          }
		                                                          entry.subscribers.forEach(function (requery) {
		                                                              return affectedSubscribers_1.add(requery);
		                                                          });
		                                                      }
		                                                  }
		                                              }
		                                          }
		                                      }
		                                  }
		                              }
		                              affectedSubscribers_1.forEach(function (requery) { return requery(); });
		                          }
		                      }; };
		                      idbtrans.addEventListener('abort', endTransaction(false), {
		                          signal: signal,
		                      });
		                      idbtrans.addEventListener('error', endTransaction(false), {
		                          signal: signal,
		                      });
		                      idbtrans.addEventListener('complete', endTransaction(true), {
		                          signal: signal,
		                      });
		                  }
		                  return idbtrans;
		              }, table: function (tableName) {
		                  var downTable = core.table(tableName);
		                  var primKey = downTable.schema.primaryKey;
		                  var tableMW = __assign(__assign({}, downTable), { mutate: function (req) {
		                          var trans = PSD.trans;
		                          if (primKey.outbound ||
		                              trans.db._options.cache === 'disabled' ||
		                              trans.explicit ||
		                              trans.idbtrans.mode !== 'readwrite'
		                          ) {
		                              return downTable.mutate(req);
		                          }
		                          var tblCache = cache["idb://".concat(dbName, "/").concat(tableName)];
		                          if (!tblCache)
		                              return downTable.mutate(req);
		                          var promise = downTable.mutate(req);
		                          if ((req.type === 'add' || req.type === 'put') &&
		                              (req.values.length >= 50 ||
		                                  getEffectiveKeys(primKey, req).some(function (key) { return key == null; }))) {
		                              promise.then(function (res) {
		                                  var reqWithResolvedKeys = __assign(__assign({}, req), { values: req.values.map(function (value, i) {
		                                          var _a;
		                                          if (res.failures[i])
		                                              return value;
		                                          var valueWithKey = ((_a = primKey.keyPath) === null || _a === void 0 ? void 0 : _a.includes('.'))
		                                              ? deepClone(value)
		                                              : __assign({}, value);
		                                          setByKeyPath(valueWithKey, primKey.keyPath, res.results[i]);
		                                          return valueWithKey;
		                                      }) });
		                                  var adjustedReq = adjustOptimisticFromFailures(tblCache, reqWithResolvedKeys, res);
		                                  tblCache.optimisticOps.push(adjustedReq);
		                                  queueMicrotask(function () {
		                                      return req.mutatedParts &&
		                                          signalSubscribersLazily(req.mutatedParts);
		                                  });
		                              });
		                          }
		                          else {
		                              tblCache.optimisticOps.push(req);
		                              req.mutatedParts && signalSubscribersLazily(req.mutatedParts);
		                              promise.then(function (res) {
		                                  if (res.numFailures > 0) {
		                                      delArrayItem(tblCache.optimisticOps, req);
		                                      var adjustedReq = adjustOptimisticFromFailures(tblCache, req, res);
		                                      if (adjustedReq) {
		                                          tblCache.optimisticOps.push(adjustedReq);
		                                      }
		                                      req.mutatedParts && signalSubscribersLazily(req.mutatedParts);
		                                  }
		                              });
		                              promise.catch(function () {
		                                  delArrayItem(tblCache.optimisticOps, req);
		                                  req.mutatedParts && signalSubscribersLazily(req.mutatedParts);
		                              });
		                          }
		                          return promise;
		                      }, query: function (req) {
		                          var _a;
		                          if (!isCachableContext(PSD, downTable) ||
		                              !isCachableRequest('query', req))
		                              return downTable.query(req);
		                          var freezeResults = ((_a = PSD.trans) === null || _a === void 0 ? void 0 : _a.db._options.cache) ===
		                              'immutable';
		                          var _b = PSD, requery = _b.requery, signal = _b.signal;
		                          var _c = findCompatibleQuery(dbName, tableName, 'query', req), cacheEntry = _c[0], exactMatch = _c[1], tblCache = _c[2], container = _c[3];
		                          if (cacheEntry && exactMatch) {
		                              cacheEntry.obsSet = req.obsSet;
		                          }
		                          else {
		                              var promise = downTable
		                                  .query(req)
		                                  .then(function (res) {
		                                  var result = res.result;
		                                  if (cacheEntry)
		                                      cacheEntry.res = result;
		                                  if (freezeResults) {
		                                      for (var i = 0, l = result.length; i < l; ++i) {
		                                          Object.freeze(result[i]);
		                                      }
		                                      Object.freeze(result);
		                                  }
		                                  return res;
		                              })
		                                  .catch(function (error) {
		                                  if (container && cacheEntry)
		                                      delArrayItem(container, cacheEntry);
		                                  return Promise.reject(error);
		                              });
		                              cacheEntry = {
		                                  obsSet: req.obsSet,
		                                  promise: promise,
		                                  subscribers: new Set(),
		                                  type: 'query',
		                                  req: req,
		                                  dirty: false,
		                              };
		                              if (container) {
		                                  container.push(cacheEntry);
		                              }
		                              else {
		                                  container = [cacheEntry];
		                                  if (!tblCache) {
		                                      tblCache = cache["idb://".concat(dbName, "/").concat(tableName)] = {
		                                          queries: {
		                                              query: {},
		                                              count: {},
		                                          },
		                                          objs: new Map(),
		                                          optimisticOps: [],
		                                          unsignaledParts: {},
		                                      };
		                                  }
		                                  tblCache.queries.query[req.query.index.name || ''] = container;
		                              }
		                          }
		                          subscribeToCacheEntry(cacheEntry, container, requery, signal);
		                          return cacheEntry.promise.then(function (res) {
		                              var result = applyOptimisticOps(res.result, req, tblCache === null || tblCache === void 0 ? void 0 : tblCache.optimisticOps, downTable, cacheEntry, freezeResults);
		                              return {
		                                  result: freezeResults ? result : deepClone(result),
		                              };
		                          });
		                      } });
		                  return tableMW;
		              } });
		          return coreMW;
		      },
		  };

		  function vipify(target, vipDb) {
		      return new Proxy(target, {
		          get: function (target, prop, receiver) {
		              if (prop === 'db')
		                  return vipDb;
		              return Reflect.get(target, prop, receiver);
		          },
		      });
		  }

		  var Dexie$1 =  (function () {
		      function Dexie(name, options) {
		          var _this = this;
		          this._middlewares = {};
		          this.verno = 0;
		          var deps = Dexie.dependencies;
		          this._options = options = __assign({
		              addons: Dexie.addons, autoOpen: true,
		              indexedDB: deps.indexedDB, IDBKeyRange: deps.IDBKeyRange, cache: 'cloned', maxConnections: DEFAULT_MAX_CONNECTIONS }, options);
		          this._deps = {
		              indexedDB: options.indexedDB,
		              IDBKeyRange: options.IDBKeyRange,
		          };
		          var addons = options.addons;
		          this._dbSchema = {};
		          this._versions = [];
		          this._storeNames = [];
		          this._allTables = {};
		          this.idbdb = null;
		          this._novip = this;
		          var state = {
		              dbOpenError: null,
		              isBeingOpened: false,
		              onReadyBeingFired: null,
		              openComplete: false,
		              dbReadyResolve: nop,
		              dbReadyPromise: null,
		              cancelOpen: nop,
		              openCanceller: null,
		              autoSchema: true,
		              PR1398_maxLoop: 3,
		              autoOpen: options.autoOpen,
		          };
		          state.dbReadyPromise = new DexiePromise(function (resolve) {
		              state.dbReadyResolve = resolve;
		          });
		          state.openCanceller = new DexiePromise(function (_, reject) {
		              state.cancelOpen = reject;
		          });
		          this._state = state;
		          this.name = name;
		          this.on = Events(this, 'populate', 'blocked', 'versionchange', 'close', {
		              ready: [promisableChain, nop],
		          });
		          this.once = function (event, callback) {
		              var fn = function () {
		                  var args = [];
		                  for (var _i = 0; _i < arguments.length; _i++) {
		                      args[_i] = arguments[_i];
		                  }
		                  _this.on(event).unsubscribe(fn);
		                  callback.apply(_this, args);
		              };
		              return _this.on(event, fn);
		          };
		          this.on.ready.subscribe = override(this.on.ready.subscribe, function (subscribe) {
		              return function (subscriber, bSticky) {
		                  Dexie.vip(function () {
		                      var state = _this._state;
		                      if (state.openComplete) {
		                          if (!state.dbOpenError)
		                              DexiePromise.resolve().then(subscriber);
		                          if (bSticky)
		                              subscribe(subscriber);
		                      }
		                      else if (state.onReadyBeingFired) {
		                          state.onReadyBeingFired.push(subscriber);
		                          if (bSticky)
		                              subscribe(subscriber);
		                      }
		                      else {
		                          subscribe(subscriber);
		                          var db_1 = _this;
		                          if (!bSticky)
		                              subscribe(function unsubscribe() {
		                                  db_1.on.ready.unsubscribe(subscriber);
		                                  db_1.on.ready.unsubscribe(unsubscribe);
		                              });
		                      }
		                  });
		              };
		          });
		          this.Collection = createCollectionConstructor(this);
		          this.Table = createTableConstructor(this);
		          this.Transaction = createTransactionConstructor(this);
		          this.Version = createVersionConstructor(this);
		          this.WhereClause = createWhereClauseConstructor(this);
		          this.on('versionchange', function (ev) {
		              if (ev.newVersion > 0)
		                  console.warn("Another connection wants to upgrade database '".concat(_this.name, "'. Closing db now to resume the upgrade."));
		              else
		                  console.warn("Another connection wants to delete database '".concat(_this.name, "'. Closing db now to resume the delete request."));
		              _this.close({ disableAutoOpen: false });
		          });
		          this.on('blocked', function (ev) {
		              if (!ev.newVersion || ev.newVersion < ev.oldVersion)
		                  console.warn("Dexie.delete('".concat(_this.name, "') was blocked"));
		              else
		                  console.warn("Upgrade '".concat(_this.name, "' blocked by other connection holding version ").concat(ev.oldVersion / 10));
		          });
		          this._maxKey = getMaxKey(options.IDBKeyRange);
		          this._createTransaction = function (mode, storeNames, dbschema, parentTransaction) {
		              return new _this.Transaction(mode, storeNames, dbschema, _this._options.chromeTransactionDurability, parentTransaction);
		          };
		          this._fireOnBlocked = function (ev) {
		              _this.on('blocked').fire(ev);
		              connections
		                  .toArray()
		                  .filter(function (c) { return c.name === _this.name && c !== _this && !c._state.vcFired; })
		                  .map(function (c) { return c.on('versionchange').fire(ev); });
		          };
		          this.use(cacheExistingValuesMiddleware);
		          this.use(cacheMiddleware);
		          this.use(observabilityMiddleware);
		          this.use(virtualIndexMiddleware);
		          this.use(hooksMiddleware);
		          var vipDB = new Proxy(this, {
		              get: function (_, prop, receiver) {
		                  if (prop === '_vip')
		                      return true;
		                  if (prop === 'table')
		                      return function (tableName) { return vipify(_this.table(tableName), vipDB); };
		                  var rv = Reflect.get(_, prop, receiver);
		                  if (rv instanceof Table)
		                      return vipify(rv, vipDB);
		                  if (prop === 'tables')
		                      return rv.map(function (t) { return vipify(t, vipDB); });
		                  if (prop === '_createTransaction')
		                      return function () {
		                          var tx = rv.apply(this, arguments);
		                          return vipify(tx, vipDB);
		                      };
		                  return rv;
		              },
		          });
		          this.vip = vipDB;
		          addons.forEach(function (addon) { return addon(_this); });
		      }
		      Dexie.prototype.version = function (versionNumber) {
		          if (isNaN(versionNumber) || versionNumber < 0.1)
		              throw new exceptions.Type("Given version is not a positive number");
		          versionNumber = Math.round(versionNumber * 10) / 10;
		          if (this.idbdb || this._state.isBeingOpened)
		              throw new exceptions.Schema('Cannot add version when database is open');
		          this.verno = Math.max(this.verno, versionNumber);
		          var versions = this._versions;
		          var versionInstance = versions.filter(function (v) { return v._cfg.version === versionNumber; })[0];
		          if (versionInstance)
		              return versionInstance;
		          versionInstance = new this.Version(versionNumber);
		          versions.push(versionInstance);
		          versions.sort(lowerVersionFirst);
		          versionInstance.stores({});
		          this._state.autoSchema = false;
		          return versionInstance;
		      };
		      Dexie.prototype._whenReady = function (fn) {
		          var _this = this;
		          return this.idbdb &&
		              (this._state.openComplete || PSD.letThrough || this._vip)
		              ? fn()
		              : new DexiePromise(function (resolve, reject) {
		                  if (_this._state.openComplete) {
		                      return reject(new exceptions.DatabaseClosed(_this._state.dbOpenError));
		                  }
		                  if (!_this._state.isBeingOpened) {
		                      if (!_this._state.autoOpen) {
		                          reject(new exceptions.DatabaseClosed());
		                          return;
		                      }
		                      _this.open().catch(nop);
		                  }
		                  _this._state.dbReadyPromise.then(resolve, reject);
		              }).then(fn);
		      };
		      Dexie.prototype.use = function (_a) {
		          var stack = _a.stack, create = _a.create, level = _a.level, name = _a.name;
		          if (name)
		              this.unuse({ stack: stack, name: name });
		          var middlewares = this._middlewares[stack] || (this._middlewares[stack] = []);
		          middlewares.push({
		              stack: stack,
		              create: create,
		              level: level == null ? 10 : level,
		              name: name,
		          });
		          middlewares.sort(function (a, b) { return a.level - b.level; });
		          return this;
		      };
		      Dexie.prototype.unuse = function (_a) {
		          var stack = _a.stack, name = _a.name, create = _a.create;
		          if (stack && this._middlewares[stack]) {
		              this._middlewares[stack] = this._middlewares[stack].filter(function (mw) {
		                  return create
		                      ? mw.create !== create
		                      : name
		                          ? mw.name !== name
		                          : false;
		              });
		          }
		          return this;
		      };
		      Dexie.prototype.open = function () {
		          var _this = this;
		          return usePSD(globalPSD,
		          function () { return dexieOpen(_this); });
		      };
		      Dexie.prototype._close = function () {
		          this.on.close.fire(new CustomEvent('close'));
		          var state = this._state;
		          connections.remove(this);
		          if (this.idbdb) {
		              try {
		                  this.idbdb.close();
		              }
		              catch (e) { }
		              this.idbdb = null;
		          }
		          if (!state.isBeingOpened) {
		              state.dbReadyPromise = new DexiePromise(function (resolve) {
		                  state.dbReadyResolve = resolve;
		              });
		              state.openCanceller = new DexiePromise(function (_, reject) {
		                  state.cancelOpen = reject;
		              });
		          }
		      };
		      Dexie.prototype.close = function (_a) {
		          var _b = _a === void 0 ? { disableAutoOpen: true } : _a, disableAutoOpen = _b.disableAutoOpen;
		          var state = this._state;
		          if (disableAutoOpen) {
		              if (state.isBeingOpened) {
		                  state.cancelOpen(new exceptions.DatabaseClosed());
		              }
		              this._close();
		              state.autoOpen = false;
		              state.dbOpenError = new exceptions.DatabaseClosed();
		          }
		          else {
		              this._close();
		              state.autoOpen = this._options.autoOpen || state.isBeingOpened;
		              state.openComplete = false;
		              state.dbOpenError = null;
		          }
		      };
		      Dexie.prototype.delete = function (closeOptions) {
		          var _this = this;
		          if (closeOptions === void 0) { closeOptions = { disableAutoOpen: true }; }
		          var hasInvalidArguments = arguments.length > 0 && typeof arguments[0] !== 'object';
		          var state = this._state;
		          return new DexiePromise(function (resolve, reject) {
		              var doDelete = function () {
		                  _this.close(closeOptions);
		                  var req = _this._deps.indexedDB.deleteDatabase(_this.name);
		                  req.onsuccess = wrap(function () {
		                      _onDatabaseDeleted(_this._deps, _this.name);
		                      resolve();
		                  });
		                  req.onerror = eventRejectHandler(reject);
		                  req.onblocked = _this._fireOnBlocked;
		              };
		              if (hasInvalidArguments)
		                  throw new exceptions.InvalidArgument('Invalid closeOptions argument to db.delete()');
		              if (state.isBeingOpened) {
		                  state.dbReadyPromise.then(doDelete);
		              }
		              else {
		                  doDelete();
		              }
		          });
		      };
		      Dexie.prototype.backendDB = function () {
		          return this.idbdb;
		      };
		      Dexie.prototype.isOpen = function () {
		          return this.idbdb !== null;
		      };
		      Dexie.prototype.hasBeenClosed = function () {
		          var dbOpenError = this._state.dbOpenError;
		          return dbOpenError && dbOpenError.name === 'DatabaseClosed';
		      };
		      Dexie.prototype.hasFailed = function () {
		          return this._state.dbOpenError !== null;
		      };
		      Dexie.prototype.dynamicallyOpened = function () {
		          return this._state.autoSchema;
		      };
		      Object.defineProperty(Dexie.prototype, "tables", {
		          get: function () {
		              var _this = this;
		              return keys(this._allTables).map(function (name) { return _this._allTables[name]; });
		          },
		          enumerable: false,
		          configurable: true
		      });
		      Dexie.prototype.transaction = function () {
		          var args = extractTransactionArgs.apply(this, arguments);
		          return this._transaction.apply(this, args);
		      };
		      Dexie.prototype._transaction = function (mode, tables, scopeFunc) {
		          var _this = this;
		          var parentTransaction = PSD.trans;
		          if (!parentTransaction ||
		              parentTransaction.db !== this ||
		              mode.indexOf('!') !== -1)
		              parentTransaction = null;
		          var onlyIfCompatible = mode.indexOf('?') !== -1;
		          mode = mode.replace('!', '').replace('?', '');
		          var idbMode, storeNames;
		          try {
		              storeNames = tables.map(function (table) {
		                  var storeName = table instanceof _this.Table ? table.name : table;
		                  if (typeof storeName !== 'string')
		                      throw new TypeError('Invalid table argument to Dexie.transaction(). Only Table or String are allowed');
		                  return storeName;
		              });
		              if (mode == 'r' || mode === READONLY)
		                  idbMode = READONLY;
		              else if (mode == 'rw' || mode == READWRITE)
		                  idbMode = READWRITE;
		              else
		                  throw new exceptions.InvalidArgument('Invalid transaction mode: ' + mode);
		              if (parentTransaction) {
		                  if (parentTransaction.mode === READONLY && idbMode === READWRITE) {
		                      if (onlyIfCompatible) {
		                          parentTransaction = null;
		                      }
		                      else
		                          throw new exceptions.SubTransaction('Cannot enter a sub-transaction with READWRITE mode when parent transaction is READONLY');
		                  }
		                  if (parentTransaction) {
		                      storeNames.forEach(function (storeName) {
		                          if (parentTransaction &&
		                              parentTransaction.storeNames.indexOf(storeName) === -1) {
		                              if (onlyIfCompatible) {
		                                  parentTransaction = null;
		                              }
		                              else
		                                  throw new exceptions.SubTransaction('Table ' + storeName + ' not included in parent transaction.');
		                          }
		                      });
		                  }
		                  if (onlyIfCompatible &&
		                      parentTransaction &&
		                      !parentTransaction.active) {
		                      parentTransaction = null;
		                  }
		              }
		          }
		          catch (e) {
		              return parentTransaction
		                  ? parentTransaction._promise(null, function (_, reject) {
		                      reject(e);
		                  })
		                  : rejection(e);
		          }
		          var enterTransaction = enterTransactionScope.bind(null, this, idbMode, storeNames, parentTransaction, scopeFunc);
		          return parentTransaction
		              ? parentTransaction._promise(idbMode, enterTransaction, 'lock')
		              : PSD.trans
		                  ?
		                      usePSD(PSD.transless, function () { return _this._whenReady(enterTransaction); })
		                  : this._whenReady(enterTransaction);
		      };
		      Dexie.prototype.table = function (tableName) {
		          if (!hasOwn(this._allTables, tableName)) {
		              throw new exceptions.InvalidTable("Table ".concat(tableName, " does not exist"));
		          }
		          return this._allTables[tableName];
		      };
		      return Dexie;
		  }());

		  var symbolObservable = typeof Symbol !== 'undefined' && 'observable' in Symbol
		      ? Symbol.observable
		      : '@@observable';
		  var Observable =  (function () {
		      function Observable(subscribe) {
		          this._subscribe = subscribe;
		      }
		      Observable.prototype.subscribe = function (x, error, complete) {
		          return this._subscribe(!x || typeof x === 'function' ? { next: x, error: error, complete: complete } : x);
		      };
		      Observable.prototype[symbolObservable] = function () {
		          return this;
		      };
		      return Observable;
		  }());

		  var domDeps;
		  try {
		      domDeps = {
		          indexedDB: _global.indexedDB ||
		              _global.mozIndexedDB ||
		              _global.webkitIndexedDB ||
		              _global.msIndexedDB,
		          IDBKeyRange: _global.IDBKeyRange || _global.webkitIDBKeyRange,
		      };
		  }
		  catch (e) {
		      domDeps = { indexedDB: null, IDBKeyRange: null };
		  }

		  function liveQuery(querier) {
		      var hasValue = false;
		      var currentValue;
		      var observable = new Observable(function (observer) {
		          var scopeFuncIsAsync = isAsyncFunction(querier);
		          function execute(ctx) {
		              var wasRootExec = beginMicroTickScope();
		              try {
		                  if (scopeFuncIsAsync) {
		                      incrementExpectedAwaits();
		                  }
		                  var rv = newScope(querier, ctx);
		                  if (scopeFuncIsAsync) {
		                      rv = rv.finally(decrementExpectedAwaits);
		                  }
		                  return rv;
		              }
		              finally {
		                  wasRootExec && endMicroTickScope();
		              }
		          }
		          var closed = false;
		          var abortController;
		          var accumMuts = {};
		          var currentObs = {};
		          var subscription = {
		              get closed() {
		                  return closed;
		              },
		              unsubscribe: function () {
		                  if (closed)
		                      return;
		                  closed = true;
		                  if (abortController)
		                      abortController.abort();
		                  if (startedListening)
		                      globalEvents.storagemutated.unsubscribe(mutationListener);
		              },
		          };
		          observer.start && observer.start(subscription);
		          var startedListening = false;
		          var doQuery = function () { return execInGlobalContext(_doQuery); };
		          function shouldNotify() {
		              return obsSetsOverlap(currentObs, accumMuts);
		          }
		          var mutationListener = function (parts) {
		              extendObservabilitySet(accumMuts, parts);
		              if (shouldNotify()) {
		                  doQuery();
		              }
		          };
		          var _doQuery = function () {
		              if (closed ||
		                  !domDeps.indexedDB)
		               {
		                  return;
		              }
		              accumMuts = {};
		              var subscr = {};
		              if (abortController)
		                  abortController.abort();
		              abortController = new AbortController();
		              var ctx = {
		                  subscr: subscr,
		                  signal: abortController.signal,
		                  requery: doQuery,
		                  querier: querier,
		                  trans: null,
		              };
		              var ret = execute(ctx);
		              if (!startedListening) {
		                  globalEvents.storagemutated.subscribe(mutationListener);
		                  startedListening = true;
		              }
		              Promise.resolve(ret).then(function (result) {
		                  hasValue = true;
		                  currentValue = result;
		                  if (closed || ctx.signal.aborted) {
		                      return;
		                  }
		                  if (shouldNotify()) {
		                      doQuery();
		                  }
		                  else {
		                      currentObs = subscr;
		                      if (shouldNotify()) {
		                          doQuery();
		                      }
		                      else {
		                          accumMuts = {};
		                          execInGlobalContext(function () { return !closed && observer.next && observer.next(result); });
		                      }
		                  }
		              }, function (err) {
		                  hasValue = false;
		                  if (!['DatabaseClosedError', 'AbortError'].includes(err === null || err === void 0 ? void 0 : err.name)) {
		                      if (!closed)
		                          execInGlobalContext(function () {
		                              if (closed)
		                                  return;
		                              observer.error && observer.error(err);
		                          });
		                  }
		              });
		          };
		          setTimeout(doQuery, 0);
		          return subscription;
		      });
		      observable.hasValue = function () { return hasValue; };
		      observable.getValue = function () { return currentValue; };
		      return observable;
		  }

		  var Dexie = Dexie$1;
		  props(Dexie, __assign(__assign({}, fullNameExceptions), {
		      delete: function (databaseName) {
		          var db = new Dexie(databaseName, { addons: [] });
		          return db.delete();
		      },
		      exists: function (name) {
		          return new Dexie(name, { addons: [] })
		              .open()
		              .then(function (db) {
		              db.close();
		              return true;
		          })
		              .catch('NoSuchDatabaseError', function () { return false; });
		      },
		      getDatabaseNames: function (cb) {
		          try {
		              return getDatabaseNames(Dexie.dependencies).then(cb);
		          }
		          catch (_a) {
		              return rejection(new exceptions.MissingAPI());
		          }
		      },
		      defineClass: function () {
		          function Class(content) {
		              extend(this, content);
		          }
		          return Class;
		      }, ignoreTransaction: function (scopeFunc) {
		          return PSD.trans
		              ? usePSD(PSD.transless || globalPSD, scopeFunc)
		              : scopeFunc();
		      }, vip: vip, async: function (generatorFn) {
		          return function () {
		              try {
		                  var rv = awaitIterator(generatorFn.apply(this, arguments));
		                  if (!rv || typeof rv.then !== 'function')
		                      return DexiePromise.resolve(rv);
		                  return rv;
		              }
		              catch (e) {
		                  return rejection(e);
		              }
		          };
		      }, spawn: function (generatorFn, args, thiz) {
		          try {
		              var rv = awaitIterator(generatorFn.apply(thiz, args || []));
		              if (!rv || typeof rv.then !== 'function')
		                  return DexiePromise.resolve(rv);
		              return rv;
		          }
		          catch (e) {
		              return rejection(e);
		          }
		      },
		      currentTransaction: {
		          get: function () { return PSD.trans || null; },
		      }, waitFor: function (promiseOrFunction, optionalTimeout) {
		          var promise = DexiePromise.resolve(typeof promiseOrFunction === 'function'
		              ? Dexie.ignoreTransaction(promiseOrFunction)
		              : promiseOrFunction).timeout(optionalTimeout || 60000);
		          return PSD.trans ? PSD.trans.waitFor(promise) : promise;
		      },
		      Promise: DexiePromise,
		      debug: {
		          get: function () { return debug; },
		          set: function (value) {
		              setDebug(value);
		          },
		      },
		      derive: derive, extend: extend, props: props, override: override,
		      Events: Events, on: globalEvents, liveQuery: liveQuery, extendObservabilitySet: extendObservabilitySet,
		      getByKeyPath: getByKeyPath, setByKeyPath: setByKeyPath, delByKeyPath: delByKeyPath, shallowClone: shallowClone, deepClone: deepClone, getObjectDiff: getObjectDiff, cmp: cmp, asap: asap$1,
		      minKey: minKey,
		      addons: [],
		      connections: {
		          get: connections.toArray,
		      },
		      errnames: errnames,
		      dependencies: domDeps, cache: cache,
		      semVer: DEXIE_VERSION, version: DEXIE_VERSION.split('.')
		          .map(function (n) { return parseInt(n); })
		          .reduce(function (p, c, i) { return p + c / Math.pow(10, i * 2); }) }));
		  Dexie.maxKey = getMaxKey(Dexie.dependencies.IDBKeyRange);

		  if (typeof dispatchEvent !== 'undefined' &&
		      typeof addEventListener !== 'undefined') {
		      globalEvents(DEXIE_STORAGE_MUTATED_EVENT_NAME, function (updatedParts) {
		          if (!propagatingLocally) {
		              var event_1;
		              event_1 = new CustomEvent(STORAGE_MUTATED_DOM_EVENT_NAME, {
		                  detail: updatedParts,
		              });
		              propagatingLocally = true;
		              dispatchEvent(event_1);
		              propagatingLocally = false;
		          }
		      });
		      addEventListener(STORAGE_MUTATED_DOM_EVENT_NAME, function (_a) {
		          var detail = _a.detail;
		          if (!propagatingLocally) {
		              propagateLocally(detail);
		          }
		      });
		  }
		  function propagateLocally(updateParts) {
		      var wasMe = propagatingLocally;
		      try {
		          propagatingLocally = true;
		          globalEvents.storagemutated.fire(updateParts);
		          signalSubscribersNow(updateParts, true);
		      }
		      finally {
		          propagatingLocally = wasMe;
		      }
		  }
		  var propagatingLocally = false;

		  var bc;
		  var createBC = function () { };
		  if (typeof BroadcastChannel !== 'undefined') {
		      createBC = function () {
		          bc = new BroadcastChannel(STORAGE_MUTATED_DOM_EVENT_NAME);
		          bc.onmessage = function (ev) { return ev.data && propagateLocally(ev.data); };
		      };
		      createBC();
		      if (typeof bc.unref === 'function') {
		          bc.unref();
		      }
		      globalEvents(DEXIE_STORAGE_MUTATED_EVENT_NAME, function (changedParts) {
		          if (!propagatingLocally) {
		              bc.postMessage(changedParts);
		          }
		      });
		  }

		  if (typeof addEventListener !== 'undefined') {
		      addEventListener('pagehide', function (event) {
		          if (!Dexie$1.disableBfCache && event.persisted) {
		              if (debug)
		                  console.debug('Dexie: handling persisted pagehide');
		              bc === null || bc === void 0 ? void 0 : bc.close();
		              for (var _i = 0, _a = connections.toArray(); _i < _a.length; _i++) {
		                  var db = _a[_i];
		                  db.close({ disableAutoOpen: false });
		              }
		          }
		      });
		      addEventListener('pageshow', function (event) {
		          if (!Dexie$1.disableBfCache && event.persisted) {
		              if (debug)
		                  console.debug('Dexie: handling persisted pageshow');
		              createBC();
		              propagateLocally({ all: new RangeSet(-Infinity, [[]]) });
		          }
		      });
		  }

		  function add(value) {
		      return new PropModification({ add: value });
		  }

		  function remove(value) {
		      return new PropModification({ remove: value });
		  }

		  function replacePrefix(a, b) {
		      return new PropModification({ replacePrefix: [a, b] });
		  }

		  DexiePromise.rejectionMapper = mapError;
		  setDebug(debug);

		  var namedExports = /*#__PURE__*/Object.freeze({
		    __proto__: null,
		    DEFAULT_MAX_CONNECTIONS: DEFAULT_MAX_CONNECTIONS,
		    Dexie: Dexie$1,
		    Entity: Entity,
		    PropModification: PropModification,
		    RangeSet: RangeSet,
		    add: add,
		    cmp: cmp,
		    default: Dexie$1,
		    liveQuery: liveQuery,
		    mergeRanges: mergeRanges,
		    rangesOverlap: rangesOverlap,
		    remove: remove,
		    replacePrefix: replacePrefix
		  });

		  __assign(Dexie$1, namedExports, { default: Dexie$1 });

		  return Dexie$1;

		}));
		
	} (dexie$1));
	return dexie$1.exports;
}

var dexieExports = requireDexie();
const _Dexie = /*@__PURE__*/getDefaultExportFromCjs(dexieExports);

// Making the module version consumable via require - to prohibit
// multiple occurrancies of the same module in the same app
// (dual package hazard, https://nodejs.org/api/packages.html#dual-package-hazard)
const DexieSymbol = Symbol.for("Dexie");
const Dexie = globalThis[DexieSymbol] || (globalThis[DexieSymbol] = _Dexie);
if (_Dexie.semVer !== Dexie.semVer) {
    throw new Error(`Two different versions of Dexie loaded in the same app: ${_Dexie.semVer} and ${Dexie.semVer}`);
}
const { liveQuery, mergeRanges, rangesOverlap, RangeSet, cmp, Entity,
    PropModification, replacePrefix, add, remove,
    DexieYProvider } = Dexie;

// 本地存储：Dexie / IndexedDB 是唯一的持久层，localStorage 只留一次性 UI 标记。
//
// 为什么不是 localStorage：收藏要按类型/时间查询、引用要按问题关联、点亮要按节点去重，
// 这些都需要索引与事务；localStorage 是同步 key-value，5MB 上限且没有事务。
// 旧的三个键不删——迁移写完 Dexie 再标记，旧数据保留一版供用户手动清理。
//
// 文件下半部分是纯函数（规划迁移、规划裁剪、组装导出），不碰 IndexedDB，
// 因此可以在 jsdom 里直接单测——这是 vitest 这条测试线的落点。


const LS = {
  exampleClosed: 'philo-example-closed',      // 示例纸片已关闭
  citationHint: 'philo-citation-hint',        // 首次引用提示已显示
  lastQuestion: 'philo-last-question',        // 上次问到这里
  readPos: 'philo-read-pos',                  // 单元阅读滚动位置
};

const LEGACY = {
  notes: 'philo-notes-v1',
  answers: 'philo-answers-v1',
  readPos: 'philo-read-pos',
};

const HISTORY_MAX = 200;

const db = new Dexie('philo-rag');
db.version(1).stores({
  answers: 'id, createdAt, pinned',
  citations: 'id, chunkId, answerId, pinned, createdAt',
  concepts: 'name, pinned, createdAt',
  favorites: '++id, type, refId, createdAt',
  litNodes: 'name, firstLitAt, lastHitAt',
  meta: 'key',
});

// --------------------------------------------------------------------------- //
// 纯函数：迁移 / 裁剪 / 导出
// --------------------------------------------------------------------------- //

/** 旧 localStorage → Dexie 的迁移计划。旧批注进 citations.legacyAnnotation。 */
function planLegacyMigration({ notes = [], answers = [], readPos = null } = {}) {
  const citations = (Array.isArray(notes) ? notes : [])
    .filter((n) => n && n.chunk_id)
    .map((n) => ({
      id: 'legacy:' + n.chunk_id,
      chunkId: n.chunk_id,
      answerId: '',
      citation: n.citation || '',
      snippet: String(n.text || '').slice(0, 200),   // 只留片段，正文按 chunk_id 回捞
      unit: n.unit || '',
      unitTitle: n.unit_title || '',
      legacyAnnotation: n.note || '',   // 批注不再有编辑 UI，只读展示与导出
      pinned: 0,
      createdAt: n.ts || Date.now(),
    }));

  const rows = (Array.isArray(answers) ? answers : [])
    .filter((a) => a && a.id && a.answer)
    .map((a) => ({
      id: String(a.id),
      question: a.question || '',
      standalone: a.standalone || '',
      strategy: a.strategy || 'point',
      answer: a.answer,
      citations: a.citations || [],
      litNodes: a.litNodes || [],
      conversationId: a.conversationId || '',
      pinned: a.pinned ? 1 : 0,
      createdAt: a.ts || Date.now(),
    }));

  return {
    citations,
    answers: rows,
    readPos: readPos && typeof readPos === 'object' ? readPos : null,
  };
}

/** 裁剪计划：超出上限时先丢最早的未收藏条目，收藏的留到最后。返回要删的 id。 */
function planTrim(rows, max = HISTORY_MAX) {
  if (!rows || rows.length <= max) return [];
  const byAge = [...rows].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const order = [...byAge.filter((r) => !r.pinned), ...byAge.filter((r) => r.pinned)];
  return order.slice(0, rows.length - max).map((r) => r.id);
}

/** 「导出 JSON（全部回答）」的内容：answers / citations / litNodes 全量，不依赖收藏。 */
function buildExportJson({ answers = [], citations = [], litNodes = [], meta = [] } = {}) {
  return {
    exportedAt: new Date().toISOString(),
    answers,
    citations,
    litNodes,
    meta,
  };
}

/** 「导出 Markdown（收藏）」：四类收藏按类型分节。 */
function buildFavoritesMarkdown({ favorites = [], answers = [], citations = [], concepts = [] } = {}) {
  const lines = ['# 星匣导出', '', '导出时间：' + new Date().toLocaleString('zh-CN'), ''];
  const byType = (t) => favorites.filter((f) => f.type === t);

  const questions = byType('question');
  if (questions.length) {
    lines.push('## 问题', '');
    for (const f of questions) lines.push('- ' + (f.title || f.refId));
    lines.push('');
  }

  const answerIds = new Set(byType('answer').map((f) => f.refId));
  const pickedAnswers = answers.filter((a) => answerIds.has(a.id));
  if (pickedAnswers.length) {
    lines.push('## 回答', '');
    for (const a of pickedAnswers) {
      lines.push('### ' + (a.question || '（未记录问题）'), '');
      lines.push(String(a.answer || '').trim(), '');
      if (a.litNodes && a.litNodes.length) lines.push('点亮：' + a.litNodes.join('、'), '');
    }
  }

  const citationIds = new Set(byType('citation').map((f) => f.refId));
  const pickedCitations = citations.filter((c) => citationIds.has(c.id) || citationIds.has(c.chunkId));
  if (pickedCitations.length) {
    lines.push('## 引用', '');
    for (const c of pickedCitations) {
      lines.push('- ' + (c.citation || c.chunkId));
      if (c.snippet) lines.push('  > ' + String(c.snippet).replace(/\n/g, ' '));
      if (c.legacyAnnotation) lines.push('  批注：' + c.legacyAnnotation);
    }
    lines.push('');
  }

  const conceptNames = new Set(byType('concept').map((f) => f.refId));
  const pickedConcepts = concepts.filter((c) => conceptNames.has(c.name));
  if (pickedConcepts.length) {
    lines.push('## 概念', '');
    for (const c of pickedConcepts) lines.push('- ' + c.name + (c.definition ? '：' + c.definition : ''));
    lines.push('');
  }

  return lines.join('\n');
}

// --------------------------------------------------------------------------- //
// localStorage：只留一次性标记与上次问题
// --------------------------------------------------------------------------- //
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式 / 配额不足：界面仍可用 */
  }
}

function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function setFlag(key, on = true) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* 同上 */
  }
}

function getLastQuestion() {
  try {
    return localStorage.getItem(LS.lastQuestion) || '';
  } catch {
    return '';
  }
}

function setLastQuestion(question) {
  try {
    localStorage.setItem(LS.lastQuestion, String(question || ''));
  } catch {
    /* 同上 */
  }
}

function getReadPos() {
  return readJSON(LS.readPos, null);
}

function setReadPos(pos) {
  writeJSON(LS.readPos, pos);
}

// --------------------------------------------------------------------------- //
// 迁移与读写
// --------------------------------------------------------------------------- //
async function migrateLegacy() {
  const done = await db.meta.get('migrated');
  if (done && done.value) return { migrated: false };

  const plan = planLegacyMigration({
    notes: readJSON(LEGACY.notes, []),
    answers: readJSON(LEGACY.answers, []),
    readPos: readJSON(LEGACY.readPos, null),
  });

  if (plan.citations.length) await db.citations.bulkPut(plan.citations);
  if (plan.answers.length) await db.answers.bulkPut(plan.answers);
  if (plan.readPos) {
    await db.meta.put({ key: 'legacyReadPos', value: plan.readPos });
    if (!getReadPos()) setReadPos(plan.readPos);
  }

  await db.meta.put({ key: 'migrated', value: 1 });
  return { migrated: true, notes: plan.citations.length, answers: plan.answers.length };
}

/** 点亮记录：只记直接命中（邻域临时低亮，不写库）。 */
async function recordLitNodes(names, at = Date.now()) {
  if (!names || !names.length) return;
  await db.transaction('rw', db.litNodes, async () => {
    for (const name of names) {
      const row = await db.litNodes.get(name);
      if (row) {
        await db.litNodes.put({ ...row, lastHitAt: at, count: (row.count || 1) + 1 });
      } else {
        await db.litNodes.put({ name, firstLitAt: at, lastHitAt: at, count: 1 });
      }
    }
  });
}

async function allLitNodes() {
  return db.litNodes.toArray();
}

async function saveAnswer(record) {
  await db.answers.put(record);
  await trimAnswers();
  return record;
}

async function trimAnswers(max = HISTORY_MAX) {
  const rows = await db.answers.toArray();
  const victims = planTrim(rows, max);
  if (victims.length) await db.answers.bulkDelete(victims);
}

const FAVORITE_TYPES = new Set(['question', 'answer', 'citation', 'concept']);

async function addFavorite(type, refId, payload = {}) {
  if (!FAVORITE_TYPES.has(type)) throw new Error('未知收藏类型：' + type);
  const exists = await db.favorites.where({ type, refId }).first();
  if (exists) return exists;
  const id = await db.favorites.add({ type, refId, createdAt: Date.now(), ...payload });
  return { id, type, refId, ...payload };
}

async function listFavorites(type = null) {
  const all = await db.favorites.toArray();
  return (type ? all.filter((f) => f.type === type) : all)
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function removeFavoriteById(id) {
  await db.favorites.delete(id);
}

async function exportAllJson() {
  const [answers, citations, litNodes, meta] = await Promise.all([
    db.answers.toArray(),
    db.citations.toArray(),
    db.litNodes.toArray(),
    db.meta.toArray(),
  ]);
  return buildExportJson({ answers, citations, litNodes, meta });
}

async function exportFavoritesMarkdown() {
  const [favorites, answers, citations, concepts] = await Promise.all([
    listFavorites(),
    db.answers.toArray(),
    db.citations.toArray(),
    db.concepts.toArray(),
  ]);
  return buildFavoritesMarkdown({ favorites, answers, citations, concepts });
}

/** 触发一次浏览器下载（导出链使用；不弹 toast）。 */
function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 动效调度：星图脉冲、字符尾迹、流式文字提交共用同一条 rAF。
// 空闲（没有订阅者）时立刻停掉循环——星图静止时不该有常驻绘制。

const reducedQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** `prefers-reduced-motion: reduce`：所有动画降级为「直接出现」。 */
function prefersReducedMotion() {
  return !!(reducedQuery && reducedQuery.matches);
}

/** 低性能设备：关掉尾迹层，只保留节点脉冲（见 §8.4）。 */
function isLowPowerDevice() {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  return cores <= 4 || mem <= 4;
}

const subscribers = new Set();
let frame = 0;

function tick(now) {
  frame = 0;
  for (const fn of [...subscribers]) {
    try {
      fn(now);
    } catch {
      subscribers.delete(fn);
    }
  }
  if (subscribers.size && !frame) frame = requestAnimationFrame(tick);
}

/** 订阅每帧回调；返回取消订阅函数。同一循环服务所有动画。 */
function subscribe(fn) {
  subscribers.add(fn);
  if (!frame) frame = requestAnimationFrame(tick);
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

// 星图：自绘 Canvas 2D，三层画布（背景恒星 / 星座线 / 节点与脉冲）。
//
// 概念节点仍旧遵守设计文档 §11 的硬规则：节点初始亮度 0，只有被回答命中的概念才亮；
// 未点亮节点不显示标签、不响应点击；直接命中持久、一阶邻域临时；空闲时停止 rAF。
//
// 与设计文档的差异（P1 要求）：背景不再只有 520 个不可见的灰点，而是一张**可辨识的恒星图**——
// 按幂律分布星等的程序化星表 + 银河带 + 亮星的四芒星芒。这些是装饰星，不参与点亮、
// 不可点击、不写库；「点亮只由回答命中决定」这条契约没有被改动。
//
// 相机（P2）：scale（滚轮缩放）/ rotation（拖拽旋转）/ 平移（Shift+拖拽），
// 概念节点与背景星共用同一个相机，所以缩放旋转时它们一起动。

const TAU = Math.PI * 2;
const MIN_SCALE = 0.6;
const MAX_SCALE = 3.2;
const ROTATE_PER_PX = 0.0035;   // 拖拽 1px 转多少弧度
const ENERGY_DECAY = 0.92;      // 流式脉冲每帧衰减系数

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 星色：少数偏暖、少数偏冷，多数接近白
function starColor(hue) {
  if (hue < 0.16) return [255, 224, 190];
  if (hue > 0.86) return [198, 218, 255];
  return [238, 235, 228];
}

class StarMap {
  constructor({ background, links, nodes, hitLayer, onSelect, onHover }) {
    this.bg = background;
    this.links = links;
    this.nodeCanvas = nodes;
    this.hitLayer = hitLayer;
    this.onSelect = onSelect || (() => {});
    this.onHover = onHover || (() => {});

    this.payload = null;
    this.nodes = [];
    this.edges = [];
    this.lit = new Set();          // 直接命中（持久）
    this.halo = new Set();         // 一阶邻域（临时）
    this.favorite = new Set();     // 收藏过的概念：多一圈极淡环
    this.hovered = null;
    this.focused = null;           // 键盘聚焦的已点亮节点
    this.dim = 1;                  // 阅读/薄层/星匣时整体降亮
    this.pulses = new Map();       // name → startTime
    this.linksTo = [];             // 术语命中连线：星点 → 正文里的词，约 600ms 淡出
    this.queue = [];
    this.lastPulseAt = 0;
    this.width = 0;
    this.height = 0;
    this.unsubscribe = null;
    this.hotspots = [];
    this.reduced = prefersReducedMotion();
    this.dirtyBackground = true;   // 静态层缓存：只有换数据/换尺寸/动相机时才重画

    // 观测相机：缩放、旋转、平移（世界坐标原点在屏幕中心）
    this.camera = { scale: 1, rotation: 0, tx: 0, ty: 0 };
    this.stars = [];
    this.starSeed = 0;

    // 流式脉冲能量：0..1，随每个提交的字符批次抬升、逐帧衰减（P3）
    this.energy = 0;
    this.lastFlashAt = 0;
    this.interacting = false;      // 拖拽/缩放中降级绘制，保证操作流畅
  }

  /** 交互开始/结束：结束时补画一次完整细节。 */
  setInteracting(active) {
    if (this.interacting === active) return;
    this.interacting = active;
    this.dirtyBackground = true;
    this.draw();
  }

  // ------------------------------------------------------------------ 数据 //
  setData(payload) {
    this.payload = payload;
    this.nodes = (payload.nodes || []).map((n) => ({ ...n }));
    this.edges = (payload.edges || []).map((e) => ({ ...e }));
    this.byName = new Map(this.nodes.map((n) => [n.id, n]));
    this.dirtyBackground = true;
    this.resize();
    return this;
  }

  setLit(names) {
    this.lit = new Set(names || []);
    this.draw();
    this.syncHotspots();
  }

  setHalo(names) {
    this.halo = new Set(names || []);
    this.draw();
    this.syncHotspots();
  }

  setFavorites(names) {
    this.favorite = new Set(names || []);
    this.draw();
    this.syncHotspots();
  }

  setDim(factor) {
    this.dim = Math.max(0.5, Math.min(1, factor));
    this.draw();
  }

  setHovered(name) {
    if (this.hovered === name) return;
    this.hovered = name;
    this.draw();
    this.onHover(name ? this.byName.get(name) : null);
  }

  setFocused(name) {
    this.focused = name;
    this.draw();
  }

  // ------------------------------------------------------------------ 相机 //
  /** 世界坐标（相对屏幕中心，px）→ 屏幕坐标。 */
  applyCamera(x, y) {
    const { scale, rotation, tx, ty } = this.camera;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    return {
      x: this.width / 2 + (x * c - y * s) * scale + tx,
      y: this.height / 2 + (x * s + y * c) * scale + ty,
    };
  }

  /** 屏幕坐标 → 世界坐标。缩放要钉住光标下的那一点时用它。 */
  toWorld(sx, sy) {
    const { scale, rotation, tx, ty } = this.camera;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    const dx = sx - this.width / 2 - tx;
    const dy = sy - this.height / 2 - ty;
    return { x: (dx * c + dy * s) / scale, y: (-dx * s + dy * c) / scale };
  }

  cameraChanged() {
    this.dirtyBackground = true;
    this.draw();
    this.syncHotspots();   // 热区跟着节点走
  }

  /** 滚轮缩放：钉住光标下的世界点，zoomAt(-100) 放大。 */
  zoomAt(sx, sy, deltaY) {
    const factor = Math.exp(-deltaY * 0.0016);
    const next = clamp(this.camera.scale * factor, MIN_SCALE, MAX_SCALE);
    if (next === this.camera.scale) return;
    const world = this.toWorld(sx, sy);
    this.camera.scale = next;
    const rotated = this.rotateWorld(world.x, world.y);
    this.camera.tx = sx - this.width / 2 - rotated.x;
    this.camera.ty = sy - this.height / 2 - rotated.y;
    this.cameraChanged();
  }

  rotateWorld(x, y) {
    const { scale, rotation } = this.camera;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    return { x: (x * c - y * s) * scale, y: (x * s + y * c) * scale };
  }

  /** 拖拽旋转（dx 像素）。 */
  rotateBy(dx) {
    this.camera.rotation += dx * ROTATE_PER_PX;
    this.cameraChanged();
  }

  /** Shift+拖拽平移（观星时的顺手操作）。 */
  panBy(dx, dy) {
    this.camera.tx += dx;
    this.camera.ty += dy;
    this.cameraChanged();
  }

  /** 双击 / Esc 回到初始视角。 */
  resetCamera() {
    this.camera = { scale: 1, rotation: 0, tx: 0, ty: 0 };
    this.cameraChanged();
  }

  get zoomLabel() {
    return Math.round(this.camera.scale * 100) + '%';
  }

  // ------------------------------------------------------------------ 画布 //
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.bg.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    for (const canvas of [this.bg, this.links, this.nodeCanvas]) {
      canvas.width = Math.floor(this.width * dpr);
      canvas.height = Math.floor(this.height * dpr);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      const ctx = canvas.getContext('2d');
      if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.dirtyBackground = true;
    this.buildStars();
    this.draw();
    this.syncHotspots();
  }

  /** 程序化星表：固定 seed，刷新不变。星点数量随视口面积走。 */
  buildStars() {
    const area = this.width * this.height;
    // (待补充：可见星点数量/密度策略) 当前按面积密度取 480–1200 颗
    const count = clamp(Math.round(area / 1500), 480, 1200);
    const rng = mulberry32(20261018);
    const stars = [];
    for (let i = 0; i < count; i += 1) {
      // 归一化天空坐标：[-1,1] 覆盖视口（缩放/旋转在绘制时按相机施加）
      const nx = rng() * 2 - 1;
      const ny = rng() * 2 - 1;
      // 星等按幂律：暗星多、亮星少，这样才像真实星野而不是均匀噪点
      const mag = Math.pow(rng(), 2.4);
      stars.push({ nx, ny, mag, hue: rng() });
    }
    this.stars = stars;
    this.starSeed = Math.round(area);
  }

  /** 概念节点的世界坐标（px，相对屏幕中心）。 */
  point(node) {
    const pad = 0.94;
    return this.applyCamera(node.x * (this.width / 2) * pad, node.y * (this.height / 2) * pad);
  }

  starPoint(star) {
    return this.applyCamera(star.nx * (this.width / 2), star.ny * (this.height / 2));
  }

  radius(node) {
    const axis = (this.payload?.axes || []).includes(node.id);
    const base = Math.sqrt(Math.max(node.hits || 1, 1));
    return Math.max(1.5, Math.min(5, 1.2 + base * 0.22)) + (axis ? 0.8 : 0);
  }

  /** 背景层：银河带 + 恒星 + 概念图的隐约结构线（固定 seed）。 */
  drawBackground() {
    const ctx = this.bg.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);

    // 银河：一条随相机一起转的稀薄星尘带
    const bandAngle = this.camera.rotation - 0.52;
    ctx.save();
    ctx.translate(this.width / 2 + this.camera.tx, this.height / 2 + this.camera.ty);
    ctx.rotate(bandAngle);
    const bandLen = Math.hypot(this.width, this.height) * 1.1 * this.camera.scale;
    const bandW = this.height * 0.34 * this.camera.scale;
    const grad = ctx.createLinearGradient(0, -bandW, 0, bandW);
    grad.addColorStop(0, 'rgba(150, 168, 205, 0)');
    grad.addColorStop(0.5, 'rgba(168, 182, 214, 0.085)');
    grad.addColorStop(1, 'rgba(150, 168, 205, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-bandLen / 2, -bandW, bandLen, bandW * 2);
    ctx.restore();

    // 恒星：按星等给半径、亮度、星芒。
    // 拖拽/缩放时交错取样并跳过光晕，静止后补画完整细节（交互流畅优先）。
    const lod = this.interacting;
    const stepRatio = lod ? 2 : 1;
    for (let i = 0; i < this.stars.length; i += stepRatio) {
      const star = this.stars[i];
      const p = this.starPoint(star);
      if (p.x < -8 || p.y < -8 || p.x > this.width + 8 || p.y > this.height + 8) continue;
      const mag = star.mag;
      const [r, g, b] = starColor(star.hue);
      const alpha = (0.2 + mag * 0.78) * this.dim;
      const radius = 0.45 + mag * 1.45;

      if (mag > 0.72 && !lod) {
        // 亮星：先铺一层光晕
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 6);
        glow.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + (0.34 * alpha).toFixed(3) + ')');
        glow.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 6, 0, TAU);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')';
      ctx.arc(p.x, p.y, radius, 0, TAU);
      ctx.fill();

      if (mag > 0.88 && !lod) {
        // 最亮的几颗加四芒星芒：一眼就能认出这是星图
        const spike = radius * (4.5 + mag * 3);
        ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.3 * alpha).toFixed(3) + ')';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x - spike, p.y);
        ctx.lineTo(p.x + spike, p.y);
        ctx.moveTo(p.x, p.y - spike);
        ctx.lineTo(p.x, p.y + spike);
        ctx.stroke();
      }
    }

    // 概念图的结构线：很低但可见，像星表连线
    if (this.nodes.length) {
      ctx.strokeStyle = 'rgba(186, 196, 214, ' + (0.05 * this.dim).toFixed(3) + ')';
      ctx.lineWidth = 0.6;
      for (const edge of this.edges) {
        const a = this.byName.get(edge.source);
        const b = this.byName.get(edge.target);
        if (!a || !b) continue;
        const p1 = this.point(a);
        const p2 = this.point(b);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  }

  drawLinks() {
    const ctx = this.links.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    const lit = [...this.lit].filter((n) => this.byName.has(n));
    if (lit.length < 2) return;
    // 范围查询的星座轨迹：沿剪枝边把已点亮节点连起来
    ctx.strokeStyle = 'rgba(214, 208, 194, ' + (0.16 * this.dim).toFixed(3) + ')';
    ctx.lineWidth = 0.8;
    const litSet = new Set(lit);
    for (const edge of this.edges) {
      if (!litSet.has(edge.source) || !litSet.has(edge.target)) continue;
      const p1 = this.point(this.byName.get(edge.source));
      const p2 = this.point(this.byName.get(edge.target));
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  drawNodes(now = performance.now()) {
    const ctx = this.nodeCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    const reduced = this.reduced;

    // P3：流式脉冲——中心一团极淡的辉光 + 几颗随机被「点亮」的星，随输出节奏呼吸
    if (this.energy > 0.01) {
      const e = this.energy;
      // 阅读时（dim 低）脉冲弱一档，避免盖住正文
      const strength = e * (0.6 + 0.4 * this.dim);
      // ① 整屏极淡提亮：报告「背景在呼吸」最直接的信号
      ctx.fillStyle = 'rgba(198, 210, 235, ' + (0.035 * strength).toFixed(3) + ')';
      ctx.fillRect(0, 0, this.width, this.height);

      // ② 中心辉光：随输出节奏轻微起伏
      const wobble = 0.85 + 0.15 * Math.sin(now * 0.012);
      const glow = ctx.createRadialGradient(
        this.width / 2, this.height / 2, 0,
        this.width / 2, this.height / 2, Math.hypot(this.width, this.height) * 0.62,
      );
      glow.addColorStop(0, 'rgba(226, 232, 245, ' + (0.17 * strength * wobble).toFixed(3) + ')');
      glow.addColorStop(0.45, 'rgba(210, 220, 240, ' + (0.075 * strength * wobble).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(200, 210, 235, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, this.width, this.height);

      // ③ 闪烁星：每帧换一批被点亮的星，读起来像「星野在回应输出」
      if (this.stars.length) {
        const flickers = Math.round(10 + strength * 34);
        for (let i = 0; i < flickers; i += 1) {
          const star = this.stars[(now * 0.06 + i * 137) % this.stars.length | 0];
          if (!star || star.mag < 0.45) continue;
          const p = this.starPoint(star);
          const radius = 0.7 + star.mag * 3.2 * strength;
          ctx.beginPath();
          ctx.fillStyle = 'rgba(238, 244, 255, ' + (0.85 * strength).toFixed(3) + ')';
          ctx.arc(p.x, p.y, radius, 0, TAU);
          ctx.fill();
        }
      }
    }

    // 命中连线画在节点下面：极细、随 age 淡出
    for (const link of this.linksTo) {
      const age = (now - link.born) / 600;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(233, 229, 219, ' + (0.12 * (1 - age) * this.dim).toFixed(3) + ')';
      ctx.lineWidth = 0.6;
      ctx.moveTo(link.from.x, link.from.y);
      ctx.lineTo(link.to.x, link.to.y);
      ctx.stroke();
    }

    for (const node of this.nodes) {
      const p = this.point(node);
      const r = this.radius(node);
      const isLit = this.lit.has(node.id);
      const isHalo = !isLit && this.halo.has(node.id);
      const isHover = this.hovered === node.id || this.focused === node.id;

      let alpha = 0;
      if (isLit) alpha = 0.78;
      else if (isHalo) alpha = 0.32;
      else if (isHover) alpha = 0.6;
      if (!alpha) continue;
      alpha *= this.dim;

      const pulse = this.pulses.get(node.id);
      if (pulse && !reduced) {
        const t = Math.min(1, (now - pulse) / 620);
        const grow = 1 + t * 2.4;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(232, 228, 216, ' + (0.3 * (1 - t) * this.dim).toFixed(3) + ')';
        ctx.lineWidth = 0.9;
        ctx.arc(p.x, p.y, r * grow, 0, TAU);
        ctx.stroke();
      }

      // 点亮节点给一圈光晕：在星野里更容易认出来
      if (isLit) {
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 7);
        halo.addColorStop(0, 'rgba(236, 240, 250, ' + (0.3 * this.dim).toFixed(3) + ')');
        halo.addColorStop(1, 'rgba(236, 240, 250, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 7, 0, TAU);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.fillStyle = 'rgba(240, 237, 228, ' + alpha.toFixed(3) + ')';
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();

      if (this.favorite.has(node.id)) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(240, 237, 228, ' + (0.28 * this.dim).toFixed(3) + ')';
        ctx.lineWidth = 0.7;
        ctx.arc(p.x, p.y, r + 3.5, 0, TAU);
        ctx.stroke();
      }
    }
  }

  draw() {
    if (!this.width) return;
    if (this.dirtyBackground) {
      this.drawBackground();
      this.dirtyBackground = false;
    }
    this.drawLinks();
    this.drawNodes();
  }

  // ------------------------------------------------------------------ 脉冲 //
  /** P3：流式输出的每个提交批次抬一次能量，由 step() 逐帧衰减。 */
  flash(amount = 6) {
    const now = performance.now();
    this.energy = clamp(this.energy + 0.05 + Math.min(amount, 8) * 0.012, 0, 1);
    this.lastFlashAt = now;
    this.startLoop();
  }

  /** 一次回答的直接命中：限制条数、200ms 节流、排队逐个脉冲。 */
  enqueue(direct, halo) {
    const batch = (direct || []).slice(0, 8);
    this.queue = batch.slice();
    this.pendingHalo = halo || [];
    // 邻域是临时光晕：20 秒后自行衰减（下一次提问也会顶掉）
    clearTimeout(this.haloTimer);
    this.haloTimer = setTimeout(() => {
      this.halo = new Set();
      this.draw();
      this.syncHotspots();
    }, 20000);
    if (!this.queue.length) {
      this.setHalo(this.pendingHalo);
      return;
    }
    this.startLoop();
  }

  startLoop() {
    if (this.unsubscribe) return;
    this.unsubscribe = subscribe(() => this.step());
  }

  stopLoop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  step() {
    const now = performance.now();
    let busy = false;

    // 流式能量衰减：静止后自然回到 0，循环随之停下
    if (this.energy > 0.01) {
      this.energy *= ENERGY_DECAY;
      busy = true;
    } else if (this.energy) {
      this.energy = 0;
      this.drawNodes(now);
    }

    if (this.queue.length && now - this.lastPulseAt > 200) {
      const name = this.queue.shift();
      this.lastPulseAt = now;
      this.pulses.set(name, now);
      if (this.pendingHalo && this.pendingHalo.length && !this.queue.length) {
        this.setHalo(this.pendingHalo);   // 邻域在最后一个脉冲后一起低亮
      }
    }

    for (const [name, at] of this.pulses) {
      if (now - at > 900) this.pulses.delete(name);
      else busy = true;
    }
    this.linksTo = this.linksTo.filter((link) => now - link.born < 600);
    if (this.linksTo.length) busy = true;

    this.drawNodes(now);
    if (!busy && !this.queue.length) this.stopLoop();
  }

  /** 命中连线：从星点指向正文里的那个词，600ms 后淡掉；节点本身保持低亮。 */
  connectToDom(names) {
    if (!this.nodes.length || typeof document === 'undefined') return;
    const rect = this.nodeCanvas.getBoundingClientRect();
    const now = performance.now();
    for (const name of names || []) {
      const node = this.byName.get(name);
      if (!node) continue;
      const el = document.querySelector(
        '.term-hit[data-term="' + String(name).replace(/"/g, '\\\\"') + '"]',
      );
      if (!el) continue;
      const box = el.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      this.linksTo.push({
        from: this.point(node),
        to: { x: box.left - rect.left, y: box.top - rect.top + box.height / 2 },
        born: now,
      });
    }
    if (this.linksTo.length) this.startLoop();
  }

  /** 点击热区：只给「已点亮 / 邻域 / 收藏」的节点，未点亮节点不暴露。 */
  syncHotspots() {
    if (!this.hitLayer) return;
    const actionable = this.nodes.filter(
      (n) => this.lit.has(n.id) || this.halo.has(n.id) || this.favorite.has(n.id),
    );
    // 相机变化时热区集合通常不变：只挪位置，避免每次 pointermove 重建 DOM
    if (actionable.length === this.hotspots.length
        && actionable.every((n, i) => this.hotspots[i].name === n.id)) {
      for (let i = 0; i < actionable.length; i += 1) {
        const p = this.point(actionable[i]);
        this.hotspots[i].el.style.left = p.x + 'px';
        this.hotspots[i].el.style.top = p.y + 'px';
      }
      return;
    }
    this.hotspots = [];
    this.hitLayer.textContent = '';
    for (const node of actionable) {
      const p = this.point(node);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'star-hotspot';
      el.tabIndex = -1;   // 183 个节点不各占一个 Tab 停靠点：星图容器自己收键盘
      el.setAttribute('aria-label', node.id);
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.addEventListener('pointerdown', (e) => e.stopPropagation());   // 点在热区上不触发拖拽
      el.addEventListener('click', () => this.onSelect(node.id));
      el.addEventListener('mouseenter', () => this.setHovered(node.id));
      el.addEventListener('mouseleave', () => this.setHovered(null));
      el.addEventListener('focus', () => this.setFocused(node.id));
      el.addEventListener('blur', () => this.setFocused(null));
      this.hitLayer.appendChild(el);
      this.hotspots.push({ name: node.id, el });
    }
  }

  /** 键盘：方向键在已点亮节点之间移动，Enter 打开，Esc 离开。 */
  moveFocus(direction) {
    const order = this.nodes.filter((n) => this.lit.has(n.id));
    if (!order.length) return null;
    const current = order.findIndex((n) => n.id === this.focused);
    let next = current;
    if (current < 0) next = 0;
    else next = (current + direction + order.length) % order.length;
    const node = order[next];
    this.setFocused(node.id);
    return node.id;
  }
}

// 轻量 Markdown：只做排版需要的子集（标题 / 段落 / 列表 / 强调 / 行内代码）。
// 不渲染表格与原始 HTML——答案正文里的尖括号一律转义，避免注入。
//
// 换行必须归一：后端（Python）给出的回答是 CRLF（`\r\n`）。如果这里按 `/\n{2,}/` 切块，
// CRLF 的「空行」是 `\n\r\n`，永远匹配不上 → 整篇被当成一个块，
// 再被标题分支吃掉后半段（详见 README 的流式说明）。所以入口先归一成 LF。

const CRLF$1 = /\r\n?/g;

/** 统一换行：CRLF / CR → LF。正文、块、行内三条入口都过它。 */
function normalizeNewlines(text) {
  return String(text == null ? '' : text).replace(CRLF$1, '\n');
}

// 空行 = 两行之间只有空白：容错行尾空格与 `\r`
const BLOCK_SPLIT = /\n[ \t]*\n/;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 行内语法：`code` / **强调** / *斜体*。先转义再替换，标签由本函数自己产出。 */
function renderInline(text) {
  let out = escapeHtml(normalizeNewlines(text));
  out = out.replace(/`([^`]+)`/g, (_, code) => '<code>' + code + '</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>' + '$1' + '</strong>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>' + '$1' + '</em>');
  // 引用点占位符 ⟦cite:1,3⟧ 原样保留，由 citations.js 在 HTML 上替换成按钮
  return out;
}

/** 把正文切成块；流式渲染只重绘最后一块，前面的块定型后不再碰。 */
function splitBlocks(text) {
  return normalizeNewlines(text)
    .split(BLOCK_SPLIT)
    .map((raw) => raw.replace(/\s+$/, ''))
    .filter((raw) => raw.length > 0);
}

/** 单个块 → HTML。（标题 / 无序列表 / 有序列表 / 段落） */
function renderBlock(block) {
  const src = normalizeNewlines(block);
  const lines = src.split('\n');
  const head = lines[0].match(/^(#{1,4})\s+(.*)$/);
  if (head) {
    const level = head[1].length + 1; // # → h2：纸页顶部已有问题行，标题不抢 h1
    const title = '<h' + level + '>' + renderInline(head[2]) + '</h' + level + '>';
    // 标题后面紧跟的内容必须一起渲染：模板后端常给出「### 标题\n- 项目」这种紧凑块，
    // 只返回标题会把整段正文静默丢掉（P4 的直接成因之一）。
    const body = lines.slice(1).join('\n').replace(/^\s*\n+/, '');
    return body.trim() ? title + renderBlock(body) : title;
  }
  if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
    const items = lines.map((l) => '<li>' + renderInline(l.replace(/^\s*[-*]\s+/, '')) + '</li>');
    return '<ul>' + items.join('') + '</ul>';
  }
  if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
    const items = lines.map((l) => '<li>' + renderInline(l.replace(/^\s*\d+[.)]\s+/, '')) + '</li>');
    return '<ol>' + items.join('') + '</ol>';
  }
  return '<p>' + lines.map(renderInline).join('<br />') + '</p>';
}

// 术语匹配：只认标准名与多字符别名。
//
// 单字符别名（「道」「理」这类）一旦参与匹配，几乎每个句子里都有它——
// 词典层早就有同样的守卫（lexicon 的 guard），视觉层沿用同一套判断。

function buildTermIndex(concepts) {
  const entries = [];
  for (const concept of concepts || []) {
    const name = String(concept.name || '').trim();
    if (!name) continue;
    entries.push({ term: name, name, alias: false });
    for (const alias of concept.aliases || []) {
      const a = String(alias || '').trim();
      // 单字别名不参与视觉点亮；两字以上才值得在正文上打点
      if (a.length < 2 || a === name) continue;
      entries.push({ term: a, name, alias: true });
    }
  }
  // 长词优先：先吃掉「存在者整体」，就不会再被「存在」重复命中
  entries.sort((a, b) => b.term.length - a.term.length || a.term.localeCompare(b.term));
  return entries;
}

/** 在文本里找出所有不重叠的术语命中，返回 [{ name, start, end }]。 */
function findTerms(text, index) {
  const source = String(text || '');
  const taken = new Array(source.length).fill(false);
  const hits = [];
  for (const entry of index) {
    let from = 0;
    for (;;) {
      const at = source.indexOf(entry.term, from);
      if (at < 0) break;
      from = at + entry.term.length;
      let free = true;
      for (let i = at; i < at + entry.term.length; i += 1) {
        if (taken[i]) { free = false; break; }
      }
      if (!free) continue;
      for (let i = at; i < at + entry.term.length; i += 1) taken[i] = true;
      hits.push({ name: entry.name, term: entry.term, start: at, end: at + entry.term.length });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** 一次回答最多点亮 8 个直接命中：去重后按首次出现顺序截断。 */
function topTerms(hits, limit = 8) {
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    if (seen.has(hit.name)) continue;
    seen.add(hit.name);
    out.push(hit.name);
    if (out.length >= limit) break;
  }
  return out;
}

/** 归一化概念列表（/api/concepts → 匹配索引）。 */
function indexFromConcepts(list) {
  return buildTermIndex((list || []).map((c) => ({ name: c.name, aliases: c.aliases || [] })));
}
/** 在已渲染的正文里标出术语命中（只标每个词首次出现），供星图连线与悬停使用。
 *  在 DOM 文本节点上做，而不是在 Markdown 文本上插标记——插标记会影响标题与列表识别。 */
function markTermHits(root, names, index) {
  if (!root || !names || !names.length) return 0;
  const wanted = new Set(names);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && node.parentElement.closest('.cite-dot, code, .term-hit')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  let marked = 0;
  for (const node of textNodes) {
    if (!marked === 0 && marked >= names.length) break;
    const hits = findTerms(node.nodeValue, index).filter((h) => wanted.has(h.name));
    if (!hits.length) continue;
    const seen = new Set();
    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const hit of hits) {
      if (seen.has(hit.name)) continue;     // 每个词只标第一次出现
      seen.add(hit.name);
      frag.append(node.nodeValue.slice(cursor, hit.start));
      const span = document.createElement('span');
      span.className = 'term-hit';
      span.dataset.term = hit.name;
      span.textContent = node.nodeValue.slice(hit.start, hit.end);
      frag.append(span);
      cursor = hit.end;
      marked += 1;
    }
    frag.append(node.nodeValue.slice(cursor));
    node.replaceWith(frag);
  }
  return marked;
}

/* store.svelte.js generated by Svelte v5.57.2 */

const LIT_LIMIT = 8;

const app = proxy({
	booted: false,
	starError: '',
	input: '',
	paperKind: '',
	question: '',
	standalone: '',
	prevQuestion: '',
	intent: 'point',
	strategy: 'point',
	skipped: false,
	clarifyOffer: false,
	answerRaw: '',
	blocks: [],
	tail: '',
	runLen: 0,
	done: false,
	streaming: false,
	status: '',
	error: '',
	empty: false,
	citations: [],
	lit: [],
	halo: [],
	answerId: '',
	conversationId: null,
	focus: null,
	sheet: { open: false, citations: [], pinned: false },
	whisper: {
		open: false,
		mode: 'point',
		raw: '',
		query: '',
		results: [],
		index: 0
	},
	starbox: { open: false, tab: 'question', query: '', rows: [] },
	concept: null,
	unit: null,
	map: null,
	compare: null,
	lexicon: { concepts: [], units: [], facets: null, axes: {}, index: [] },
	starDim: 1,
	hintSeen: false,
	exampleClosed: false,
	lastQuestion: '',
	favoritesVersion: 0,
	readingScale: 1
});

const intentLine = () => app.intent === 'theme' ? '按范围查询理解：梳理这条脉络。' : '按单点查询理解：解释这个概念。';

const seedQuestion = (question) => {
	app.question = question;
	app.input = question;
	focusInput();
};

// 输入线的焦点由 App 注册：状态层不持有 DOM 引用
const inputBridge = { focus: () => {} };

function registerInput(handle) {
	inputBridge.focus = handle.focus;
	inputBridge.clear = handle.clear;
}

function focusInput() {
	inputBridge.focus && inputBridge.focus();
}

// --------------------------------------------------------------------------- //
// 启动
// --------------------------------------------------------------------------- //
async function boot() {
	if (app.booted) return;

	app.booted = true;
	app.hintSeen = readFlag(LS.citationHint);
	app.exampleClosed = readFlag(LS.exampleClosed);
	app.lastQuestion = getLastQuestion();

	try {
		await migrateLegacy();
	} catch {
		/* 迁移失败不该挡住界面：旧键仍在，用户还有原始数据 */
	}

	try {
		const [concepts, units, facets, stats] = await Promise.all([api.concepts(), api.units(), api.facets(), api.stats()]);

		app.lexicon.concepts = concepts || [];
		app.lexicon.units = units || [];
		app.lexicon.facets = facets || null;
		app.lexicon.axes = stats && stats.axes || {};
		app.lexicon.index = indexFromConcepts(concepts || []);
	} catch {
		/* 词典拿不到时，术语匹配降级为空：正文照常可读 */
	}
}

// --------------------------------------------------------------------------- //
// 提问：SSE → 缓冲 → rAF 提交 → 定型
// --------------------------------------------------------------------------- //
// 后端（Python）给的是 CRLF。块级切分、段落切分、Markdown 都要按 LF 判断，
// 所以在入口统一归一：归一之后 "\n\n" / /\n[ \t]*\n/ 才是真的空行。
const CRLF = /\r\n?/g;

const normalizeStream = (text) => String(text == null ? '' : text).replace(CRLF, '\n');
const BLANK_LINE = /\n[ \t]*\n/;
let incoming = '';
let settled = false;
let consumed = 0;
let pumpStop = null;
let settleTimer = 0;
let statusTimers = [];

function clearStatusTimers() {
	statusTimers.forEach((t) => clearTimeout(t));
	statusTimers = [];
}

function stopPump() {
	if (pumpStop) {
		pumpStop();
		pumpStop = null;
	}
}

function resetPaper() {
	stopPump();
	clearTimeout(settleTimer);
	clearStatusTimers();
	incoming = '';
	consumed = 0;
	app.answerRaw = '';
	app.blocks = [];
	app.tail = '';
	app.runLen = 0;
	app.done = false;
	app.streaming = false;
	app.error = '';
	app.empty = false;
	app.skipped = false;
	app.clarifyOffer = false;
	app.citations = [];
	app.lit = [];
	app.halo = [];
}

function pump() {
	if (pumpStop) return;

	pumpStop = subscribe(() => {
		if (consumed >= incoming.length) return;

		const backlog = incoming.length - consumed;

		// 每帧 2–6 字：积压多时取 6，语气放缓时取 2
		const take = backlog > 60 ? 6 : backlog > 20 ? 4 : 2;

		const chunk = incoming.slice(consumed, consumed + take);

		consumed += chunk.length;
		app.runLen = chunk.length;
		app.tail += chunk;

		// 每个提交批次给背景一次脉冲：星图的闪烁因此与输出节奏同频
		if (starBridge.flash) starBridge.flash(chunk.length);

		// 块边界：把已完成的块提交为 html，只留最后一块继续长
		// （用 /\n[ \t]*\n/ 而不是 '\n\n'：空行里可能带缩进）
		if (BLANK_LINE.test(app.tail)) {
			const parts = app.tail.split(BLANK_LINE);
			const rest = parts.pop() || '';

			for (const block of parts) {
				if (block.trim()) app.blocks.push(block); // 存原文：渲染在组件里做一次
			}

			app.tail = rest;
			app.runLen = 0;
		}
	});
}

/** 定型时取最长的一份文本：answerRaw / 完整缓冲 / 已提交尾巴，谁最长用谁。 */
function longestText(...candidates) {
	let best = '';

	for (const c of candidates) if (typeof c === 'string' && c.length > best.length) best = c;

	return best;
}

function finishAuthoritative() {
	const text = longestText(app.answerRaw, incoming, app.tail);

	app.blocks = splitBlocks(text);
	app.tail = '';
	app.runLen = 0;
	app.done = true;
	app.streaming = false;
	app.status = '';
}

function applyMeta(meta) {
	if (meta.conversation_id !== undefined) app.conversationId = meta.conversation_id || null;

	app.standalone = meta.standalone || '';
	app.citations = meta.citations || [];
	app.strategy = meta.strategy || app.strategy;
	app.skipped = !!meta.skipped || meta.strategy === 'gate';

	if (meta.strategy === 'gate' && meta.answer) {
		app.answerRaw = normalizeStream(meta.answer);
		app.blocks = splitBlocks(app.answerRaw);
		app.tail = '';
		app.done = true;
		app.streaming = false;
		app.status = '';
	}

	// 范围查询的星座轨迹来自 theme.anchors.concepts（不用 citations[].concepts）
	if (app.strategy === 'theme' && meta.theme && meta.theme.anchors) {
		enqueueLit(meta.theme.anchors.concepts || []);
	}
}

/** 术语命中 → 星图点亮：直接命中 ≤8、持久；邻域临时低亮。 */
function enqueueLit(names) {
	const direct = [];

	for (const name of names || []) {
		if (direct.length >= LIT_LIMIT) break;
		if (!direct.includes(name)) direct.push(name);
	}

	if (!direct.length) return;

	const halo = neighborsOf(direct);

	app.lit = [...new Set([...app.lit, ...direct])];
	app.halo = halo;
	recordLitNodes(direct).catch(() => {});
	app.favoritesVersion += 1;

	if (starBridge.enqueue) starBridge.enqueue(direct, halo);
	if (starBridge.connect) starBridge.connect(direct);
}

const starBridge = { enqueue: null, setLit: null };

/** StarField 挂上来的渲染器钩子：状态层不直接碰 canvas。 */
function attachStar(handle) {
	starBridge.enqueue = handle.enqueue;
	starBridge.setLit = handle.setLit;
	starBridge.connect = handle.connect;
	starBridge.setFavorites = handle.setFavorites;
	starBridge.flash = handle.flash;

	if (app.lit.length) handle.setLit(app.lit);
}

/** 术语命中连线：由纸页在标好 DOM 之后调用（星点 → 正文里的词）。 */
function connectTerms(names) {
	if (starBridge.connect && names && names.length) starBridge.connect(names);
}

function neighborsOf(names) {
	const graph = starBridge.graph ? starBridge.graph() : null;

	if (!graph) return [];

	const set = new Set();

	for (const edge of graph.edges || []) {
		if (names.includes(edge.source) && !names.includes(edge.target)) set.add(edge.target);
		if (names.includes(edge.target) && !names.includes(edge.source)) set.add(edge.source);
	}

	return [...set];
}

function provideGraph(getter) {
	starBridge.graph = getter;
}

/** 提交一个问题。strategy 为空时由后端 auto 判定。 */
async function ask(question, { strategy = 'auto', followup = false } = {}) {
	const text = String(question || '').trim();

	if (!text) return;

	// 同一会话里连续提问都带 conversation_id，服务端据此把「继续 / 详细点」改写成独立问题；
	// 首问（还没有 id）与 Esc 重置之后的提问才是新会话。
	if (app.question && app.question !== text) {
		app.prevQuestion = app.question;
	} else if (!app.question) {
		app.prevQuestion = '';
	}

	settled = false;
	resetPaper();
	app.paperKind = 'answer';
	app.question = text;
	app.intent = strategy === 'theme' ? 'theme' : 'point';
	app.strategy = app.intent;
	app.streaming = true;
	app.answerId = 'a-' + Date.now();
	app.status = '正在检索……';
	dispatchStatusTimers();
	setLastQuestion(text);
	app.lastQuestion = text;
	pump();

	try {
		await streamAsk({ question: text, strategy, conversationId: app.conversationId }, {
			onMeta: async (meta) => {
				applyMeta(meta);

				if (meta.strategy === 'clarify') {
					// 澄清卡不显示：前端就地回退一次点查询（§7）
					stopPump();

					app.streaming = false;
					await fallbackToPoint(text);
				}
			},

			onDelta: (delta) => {
				incoming += normalizeStream(delta);
			},

			onDone: (event) => {
				settled = true;

				const final = normalizeStream(event.answer || '');

				if (final) app.answerRaw = final;

				app.citations = event.citations || app.citations;
				incoming = final || incoming;

				if (!final && !incoming) {
					app.empty = true;
					app.streaming = false;
					app.status = '';
					stopPump();

					return;
				}

				clearStatusTimers();
				app.status = '';

				const wait = 1200;

				settleTimer = setTimeout(
					() => {
						finishAuthoritative();
						commitTermHits(event.annotations || []);
						stopPump();
					},
					wait
				);
			},

			onError: (detail) => {
				settled = true;
				clearStatusTimers();
				stopPump();
				app.streaming = false;
				app.status = '';
				app.error = detail || '这次没有接通。Enter 重试';
			},

			onClose: () => {
				// 流结束了却没有 done/error：连接被中断。保留已收到的文字，并明确告知（§8.4）
				if (settled) return;

				settled = true;
				clearStatusTimers();
				stopPump();
				finishAuthoritative();
				commitTermHits([]);
				app.error = '输出中断。Enter 重试';
			}
		});
	} catch(err) {
		clearStatusTimers();
		stopPump();
		app.streaming = false;
		app.status = '';
		app.error = navigator.onLine === false ? '服务没有响应。' : '这次没有接通。Enter 重试';
	}
}

function dispatchStatusTimers() {
	clearStatusTimers();

	statusTimers.push(setTimeout(
		() => {
			if (app.streaming && !app.done) app.status = '正在唤醒索引……';
		},
		1500
	));

	statusTimers.push(setTimeout(
		() => {
			if (app.streaming && !app.done) app.status = '仍在生成……';
		},
		6000
	));
}

async function fallbackToPoint(question) {
	try {
		const res = await api.ask({ question, strategy: 'point' });
		const body = normalizeStream(res.answer || '');
		const ok = res.strategy !== 'gate' && !res.skipped && body.trim().length > 0;

		if (!ok) throw new Error('empty');

		app.strategy = 'point';
		app.intent = 'point';
		app.standalone = res.standalone || '';
		app.conversationId = res.conversation_id || app.conversationId;
		app.answerRaw = body;
		app.citations = res.citations || [];
		app.skipped = false;
		finishAuthoritative();
		commitTermHits(res.annotations || []);
	} catch {
		app.clarifyOffer = true;
		app.answerRaw = '';
		app.blocks = [];
		app.tail = '';
		app.done = true;
		app.streaming = false;
	}
}

/** 定型后按权威文本重新算一遍术语命中：正文 + done.annotations。 */
function commitTermHits(annotations) {
	const names = [];
	const hits = findTerms(app.answerRaw || '', app.lexicon.index);

	for (const name of topTerms(hits, LIT_LIMIT)) names.push(name);

	for (const ann of annotations || []) {
		for (const name of ann.concepts || []) {
			if (names.length >= LIT_LIMIT) break;
			if (!names.includes(name)) names.push(name);
		}
	}

	if (app.strategy === 'point' && app.question) {
		const asked = findTerms(app.question, app.lexicon.index);

		for (const name of topTerms(asked, 1)) {
			if (!names.includes(name) && names.length < LIT_LIMIT) names.unshift(name);
		}
	}

	enqueueLit(names);
	rememberAnswer();
	app.focus = { type: 'answer', id: app.answerId, label: app.question };
}

function rememberAnswer() {
	if (!app.answerRaw) return;

	saveAnswer({
		id: app.answerId || 'a-' + Date.now(),
		question: app.question,
		standalone: app.standalone,
		strategy: app.strategy,
		answer: app.answerRaw,
		// 只存引用坐标，正文按 chunk_id 走 /api/context 回捞（§12.1）
		citations: app.citations.map((c) => ({
			n: c.n,
			chunk_id: c.chunk_id,
			citation: c.citation,
			unit: c.unit,
			unit_title: c.unit_title,
			start: c.start,
			end: c.end
		})),
		litNodes: app.lit.slice(),
		conversationId: app.conversationId || '',
		pinned: 0,
		createdAt: Date.now()
	}).catch(() => {});
}

function switchIntent(next) {
	if (next === app.intent) return;

	ask(app.question, { strategy: next === 'theme' ? 'theme' : 'point' });
}

function resetSession() {
	resetPaper();
	app.paperKind = '';
	app.question = '';
	app.standalone = '';
	app.prevQuestion = '';
	app.conversationId = null;
	app.error = '';
	app.focus = null;
	app.concept = null;
	app.unit = null;
	app.map = null;
	app.compare = null;
	app.starDim = 1;
}

// --------------------------------------------------------------------------- //
// 其他纸页
// --------------------------------------------------------------------------- //
async function openConcept(term) {
	const name = String(term || '').trim();

	if (!name) return;

	closeOverlays();
	app.paperKind = 'concept';
	app.question = name;
	app.answerRaw = '';
	app.tail = '';
	app.done = false;
	app.streaming = false;
	app.citations = [];
	app.starDim = 0.6;
	app.focus = { type: 'concept', id: name, label: name };

	try {
		const card = await api.concept(name);

		if (card && card.found) {
			app.concept = { ...card, semantic: null };
		} else {
			const semantic = await api.term(name).catch(() => null);

			app.concept = { ...card || { term: name, found: false }, semantic };
		}

		enqueueLit([card && card.found ? card.term || name : name]);
	} catch {
		app.concept = { term: name, found: false, semantic: null };
	}
}

async function openUnit(code) {
	closeOverlays();
	app.paperKind = 'unit';
	app.question = code;
	app.starDim = 0.6;

	try {
		app.unit = await api.unit(code);

		const saved = getReadPos();

		app.unit.savedScroll = saved && saved.code === code ? saved.scrollTop : 0;

		enqueueLit(app.unit.concepts
			? app.unit.concepts.slice(0, LIT_LIMIT).map((c) => c.name)
			: []);
	} catch {
		app.unit = null;
	}
}

async function openSystemMap() {
	closeOverlays();
	app.paperKind = 'map';
	app.question = '体系地图';
	app.starDim = 0.6;
	app.map = { units: app.lexicon.units };
}

async function openCompare(a, b) {
	closeOverlays();
	app.paperKind = 'compare';
	app.question = a + ' ↔ ' + b;
	app.starDim = 0.6;

	try {
		app.compare = await api.compare(a, b);
		enqueueLit([a, b]);
	} catch {
		app.compare = null;
	}
}

// --------------------------------------------------------------------------- //
// 浮层：引用薄层 / 星匣 / 低语层
// --------------------------------------------------------------------------- //
function closeOverlays() {
	app.sheet.open = false;
	app.whisper.open = false;
	app.starbox.open = false;
	app.starDim = app.paperKind ? 0.6 : 1;
}

function openSheet(citations, entry) {
	app.sheet.open = true;
	app.sheet.citations = citations && citations.length ? citations : [];
	app.sheet.pinned = false;
	app.starDim = 0.55;

	app.focus = citations && citations.length
		? {
			type: 'citation',
			id: citations[0].chunk_id,
			label: citations[0].citation || ''
		}
		: null;
}

function toggleSheetPin() {
	app.sheet.pinned = !app.sheet.pinned;
}

async function toggleStarbox(force) {
	const next = force == null ? !app.starbox.open : force;

	if (!next) {
		app.starbox.open = false;
		app.starDim = app.paperKind ? 0.6 : 1;

		return;
	}

	closeOverlays();
	app.starbox.open = true;
	app.starDim = 0.55;
	await refreshStarbox();
}

async function refreshStarbox() {
	const rows = await listFavorites(app.starbox.tab === 'all' ? null : app.starbox.tab);
	const query = String(app.starbox.query || '').trim();

	app.starbox.rows = rows.filter((row) => {
		if (!query) return true;

		return JSON.stringify(row).includes(query) || String(row.title || '').includes(query);
	});
}

function setStarboxTab(tab) {
	app.starbox.tab = tab;
	refreshStarbox();
}

async function dropFavorite(id) {
	await removeFavoriteById(id);
	await refreshStarbox();
	app.favoritesVersion += 1;
}

async function jumpFavorite(row) {
	if (row.type === 'concept') return openConcept(row.refId);

	if (row.type === 'citation') {
		const citations = await db.citations.toArray();
		const hit = citations.find((c) => c.id === row.refId);

		if (!hit) return openSheet([]);

		// 库里只有坐标与片段：打开薄层时按 chunk_id 回捞正文
		const ctx = await api.context(hit.chunkId).catch(() => null);

		const focus = ctx && ctx.items ? ctx.items.find((i) => i.is_focus) : null;

		return openSheet(
			[
				{ ...hit, n: 1, text: focus && focus.text || hit.snippet || '' }
			]);
	}

	if (row.type === 'question') {
		seedQuestion(row.title || row.refId);

		return closeOverlays();
	}

	if (row.type === 'answer') {
		const answers = await db.answers.toArray();
		const hit = answers.find((a) => a.id === row.refId);

		if (hit) {
			closeOverlays();
			app.paperKind = 'answer';
			app.question = hit.question;
			app.strategy = hit.strategy || 'point';
			app.intent = hit.strategy === 'theme' ? 'theme' : 'point';
			app.answerRaw = hit.answer;
			app.citations = hit.citations || [];
			app.lit = hit.litNodes || [];
			finishAuthoritative();

			if (starBridge.setLit) starBridge.setLit(app.lit);
		}
	}
}

// 低语层 ---------------------------------------------------------------- //
const WHISPER_MODES = [
	{ key: 'point', prefix: '' },
	{ key: 'quote', prefix: '引 ' },
	{ key: 'theme', prefix: '脉 ' },
	{ key: 'unit', prefix: '读 ' },
	{ key: 'map', prefix: '图 ' },
	{ key: 'compare', prefix: '对 ' }
];

function parseWhisper(raw) {
	const text = String(raw || '');

	for (const mode of WHISPER_MODES) {
		if (mode.prefix && text.startsWith(mode.prefix)) {
			return { mode: mode.key, query: text.slice(mode.prefix.length) };
		}
	}

	return { mode: 'point', query: text };
}

function openWhisper() {
	app.whisper.open = true;
	app.whisper.raw = '';
	app.whisper.query = '';
	app.whisper.results = [];
	app.whisper.index = 0;
	app.whisper.mode = 'point';
	app.starDim = app.paperKind ? 0.6 : 1;
}

function closeWhisper() {
	app.whisper.open = false;
	app.whisper.results = [];
	focusInput(); // 关闭后回到原焦点
}

/** 低语层输入：本地过滤，够快也够准；真正取数据在 Enter 时发生。 */
function updateWhisper(raw) {
	app.whisper.raw = raw;

	const { mode, query } = parseWhisper(raw);

	app.whisper.query = query;
	app.whisper.mode = mode;
	app.whisper.index = 0;

	const q = query.trim();

	if (!q) {
		app.whisper.results = [];

		return;
	}

	if (mode === 'point') {
		app.whisper.results = filterConcepts(q);
	} else if (mode === 'unit' || mode === 'map') {
		app.whisper.results = (app.lexicon.units || []).filter((u) => String(u.code).includes(q) || String(u.title || '').includes(q)).slice(0, 5).map((u) => ({ label: u.code + ' ' + (u.title || ''), value: u.code }));
	} else {
		app.whisper.results = [];
	}
}

function filterConcepts(query) {
	const q = query.toLowerCase();
	const out = [];

	for (const c of app.lexicon.concepts || []) {
		const name = String(c.name || '');

		if (name.toLowerCase().includes(q)) {
			out.push({ label: name, value: name, hint: c.definition || '' });
		} else if ((c.aliases || []).some((a) => String(a).length > 1 && String(a).toLowerCase().includes(q))) {
			out.push({ label: name, value: name, hint: c.definition || '' });
		}

		if (out.length >= 5) break;
	}

	return out;
}

async function runWhisper() {
	const mode = app.whisper.mode;
	const query = app.whisper.query.trim();
	const picked = app.whisper.results[app.whisper.index];

	if (mode === 'point') {
		const term = picked ? picked.value : query;

		if (!term) return;

		closeWhisper();

		return openConcept(term);
	}

	if (mode === 'theme') {
		if (!query) return;

		closeWhisper();

		return ask(query, { strategy: 'theme' });
	}

	if (mode === 'unit') {
		const code = picked ? picked.value : query;

		if (!code) return;

		closeWhisper();

		return openUnit(code);
	}

	if (mode === 'map') {
		closeWhisper();

		return openSystemMap();
	}

	if (mode === 'compare') {
		const pair = splitCompare(query);

		if (!pair) {
			closeWhisper();
			app.paperKind = 'compare';
			app.compare = null;
			app.question = query;

			return;
		}

		closeWhisper();

		return openCompare(pair[0], pair[1]);
	}

	if (mode === 'quote') {
		const params = parseQuoteTokens(query);

		closeWhisper();

		try {
			const payload = await api.quote({ ...params, limit: 12 });
			const quotes = (payload.quotes || []).map((q, i) => ({ ...q, n: i + 1 }));

			openSheet(quotes, null);
		} catch {
			openSheet([]);
		}
	}
}

/** 对比拆分：A ↔ B / A vs B / 两个空白分隔的词。 */
function splitCompare(text) {
	const raw = String(text || '').trim();
	const arrow = raw.split(/\s*(?:↔|<->|<=>|vs\.?|VS)\s*/);

	if (arrow.length === 2 && arrow[0].trim() && arrow[1].trim()) {
		return [arrow[0].trim(), arrow[1].trim()];
	}

	const words = raw.split(/\s+/).filter(Boolean);

	if (words.length === 2) return [words[0], words[1]];

	return null;
}

/** 引 的 token 解析：单元编号 → 说话人 → 概念 → 关键词（优先级固定）。 */
function parseQuoteTokens(text) {
	const raw = String(text || '').trim();
	const facets = app.lexicon.facets || {};
	const params = {};

	if (!raw) return params;

	const unitHit = raw.match(/(\d+(?:-\d+){0,3})/);

	if (unitHit) {
		params.unit = unitHit[1];

		const rest = raw.replace(unitHit[1], '').trim();

		if (rest) params.keyword = rest;

		return params;
	}

	const speakers = (facets.speaker || []).map((row) => row[0]);
	const concepts = (facets.concept || []).map((row) => row[0]);
	const speaker = speakers.find((s) => s && raw.includes(s));

	if (speaker) {
		params.speaker = speaker;

		const rest = raw.replace(speaker, '').trim();

		if (rest) params.keyword = rest;

		return params;
	}

	const concept = concepts.find((c) => c && c.length > 1 && raw.includes(c));

	if (concept) {
		params.concept = concept;

		const rest = raw.replace(concept, '').trim();

		if (rest) params.keyword = rest;

		return params;
	}

	params.keyword = raw;

	return params;
}

// 收藏 ------------------------------------------------------------------ //
async function favoriteFocused() {
	const focus = app.focus;

	if (!focus) return;

	const payload = { title: focus.label || focus.id };

	if (focus.type === 'citation') {
		const entry = app.sheet.citations.find((c) => c.chunk_id === focus.id) || null;

		if (entry) {
			payload.title = entry.citation || entry.chunk_id;
			payload.snippet = String(entry.text || '').slice(0, 200);
			payload.origin = app.sheet.citations.length ? app.question : '';

			// 引用只存坐标 + 一小段片段：完整正文按 chunk_id 走 /api/context 回捞（§12.1）
			await db.citations.put({
				id: 'c:' + entry.chunk_id,
				chunkId: entry.chunk_id,
				answerId: '',
				citation: entry.citation || '',
				snippet: String(entry.text || '').slice(0, 200),
				legacyAnnotation: '',
				pinned: 1,
				createdAt: Date.now()
			});
		}
	}

	await addFavorite(focus.type, focus.id, payload);
	app.favoritesVersion += 1;
	await refreshConceptFavorites();
}

/** 概念收藏 = 星图上多一圈极淡的环；收藏后立即生效，不必刷新。 */
async function refreshConceptFavorites() {
	if (!starBridge.setFavorites) return;

	const favs = await listFavorites('concept').catch(() => []);

	starBridge.setFavorites(favs.map((f) => f.refId));
}

function setFocus(focus) {
	app.focus = focus;
}

var root$c = from_html(`<span class="def"> </span>`);
var root_1$a = from_html(`<div class="star-label" aria-hidden="true"><span class="name"> </span> <!></div>`);
var root_2$9 = from_html(`<p class="star-error"> </p>`);
var root_3$9 = from_html(`<li><button type="button" class="linkish"> </button></li>`);
var root_4$9 = from_html(`<div tabindex="0" role="application" aria-label="星图：只显示被回答点亮的概念。滚轮缩放、拖拽旋转、Shift+拖拽平移、双击复位；方向键在已点亮节点间移动，Enter 打开。"><canvas class="layer"></canvas> <canvas class="layer"></canvas> <canvas class="layer"></canvas> <div class="hotspots"></div> <!> <!> <p class="sky-hint" aria-hidden="true"> </p> <ul class="lit-list" aria-live="polite"></ul></div>`);

function StarField($$anchor, $$props) {
	push($$props, true);

	let background = state(null);
	let links = state(null);
	let canvas = state(null);
	let hitLayer = state(null);
	let container = state(null);
	let label = state('');
	let labelDef = state('');
	let zoomLabel = state('100%');
	let dragging = state(false);
	let map = null;
	let drag = null;

	onMount(async () => {
		map = new StarMap({
			background: get(background),
			links: get(links),
			nodes: get(canvas),
			hitLayer: get(hitLayer),
			onSelect: (name) => {
				setFocus({ type: 'concept', id: name, label: name });
				openConcept(name);
			},

			onHover: (node) => {
				set(label, node ? node.id : '', true);

				// 一行极淡定义：星图数据里有年代 / 流派 / 别名，没有词典定义文本
				set(
					labelDef,
					node
						? [node.era, node.school, (node.aliases || [])[0]].filter(Boolean).join(' · ')
						: '',
					true
				);
			}
		});

		try {
			const payload = await api.starmap();

			map.setData(payload);
			provideGraph(() => payload);

			attachStar({
				enqueue: (direct, halo) => map.enqueue(direct, halo),
				setLit: (names) => map.setLit(names),
				connect: (names) => map.connectToDom(names),
				setFavorites: (names) => map.setFavorites(names),
				flash: (amount) => map.flash(amount) // P3：流式输出 → 背景脉冲
			});

			const lit = await allLitNodes();

			map.setLit(lit.map((n) => n.name));

			const favs = await listFavorites('concept');

			map.setFavorites(favs.map((f) => f.refId));
			app.lit = lit.map((n) => n.name);
			set(zoomLabel, map.zoomLabel, true);
		} catch {
			app.starError = '知识图谱未能载入';
		}

		const onResize = () => map && map.resize();

		window.addEventListener('resize', onResize);

		return () => window.removeEventListener('resize', onResize);
	});

	onDestroy(() => map && map.stopLoop());

	// 星图随纸页/浮层整体降亮：阅读时它退到背景里
	user_effect(() => {
		if (map) map.setDim(app.starDim);
	});

	// ------------------------------------------------------------------ 相机 //
	let wheelTimer = 0;

	function onWheel(event) {
		if (!map) return;

		event.preventDefault(); // 别让整页滚走

		const rect = get(container).getBoundingClientRect();

		map.setInteracting(true); // 连续滚轮期间降级绘制
		map.zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY);
		set(zoomLabel, map.zoomLabel, true);
		clearTimeout(wheelTimer);
		wheelTimer = setTimeout(() => map && map.setInteracting(false), 160);
	}

	function onPointerDown(event) {
		if (!map || event.button !== 0) return;
		if (event.target.closest('.star-hotspot, .lit-list, button')) return;

		drag = {
			x: event.clientX,
			y: event.clientY,
			moved: 0,
			pan: event.shiftKey
		};

		set(dragging, true);
		map.setInteracting(true);
		get(container).setPointerCapture && get(container).setPointerCapture(event.pointerId);
	}

	function onPointerMove(event) {
		if (!map || !drag) return;

		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;

		drag.x = event.clientX;
		drag.y = event.clientY;
		drag.moved += Math.abs(dx) + Math.abs(dy);

		if (drag.pan) map.panBy(dx, dy); else map.rotateBy(dx); // 左右拖 = 绕天球转

		set(zoomLabel, map.zoomLabel, true);
	}

	function onPointerUp(event) {
		if (!drag) return;

		const clicked = drag.moved < 3;

		drag = null;
		set(dragging, false);
		map.setInteracting(false); // 松手补画完整细节

		if (clicked) {
			// 空白处点一下 = 把焦点交回输入线（与既有交互契约一致）
			if (!event.shiftKey) focusInput();
		}
	}

	function onDblClick() {
		if (!map) return;

		map.resetCamera();
		set(zoomLabel, map.zoomLabel, true);
	}

	function onKeydown(event) {
		if (!map) return;

		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			event.preventDefault();

			const name = map.moveFocus(1);

			if (name) setFocus({ type: 'concept', id: name, label: name });
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			event.preventDefault();

			const name = map.moveFocus(-1);

			if (name) setFocus({ type: 'concept', id: name, label: name });
		} else if (event.key === 'Enter') {
			const name = map.focused;

			if (name) {
				event.preventDefault();
				openConcept(name);
			}
		} else if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			map.zoomAt(map.width / 2, map.height / 2, -120);
			set(zoomLabel, map.zoomLabel, true);
		} else if (event.key === '-' || event.key === '_') {
			event.preventDefault();
			map.zoomAt(map.width / 2, map.height / 2, 120);
			set(zoomLabel, map.zoomLabel, true);
		} else if (event.key === '0') {
			event.preventDefault();
			map.resetCamera();
			set(zoomLabel, map.zoomLabel, true);
		} else if (event.key === 'Escape') {
			map.setFocused(null);
			get(container).blur();
		}
	}

	var div = root_4$9();
	let classes;
	var canvas_1 = child(div);

	bind_this(canvas_1, ($$value) => set(background, $$value), () => get(background));

	var canvas_2 = sibling(canvas_1, 2);

	bind_this(canvas_2, ($$value) => set(links, $$value), () => get(links));

	var canvas_3 = sibling(canvas_2, 2);

	bind_this(canvas_3, ($$value) => set(canvas, $$value), () => get(canvas));

	var div_1 = sibling(canvas_3, 2);

	bind_this(div_1, ($$value) => set(hitLayer, $$value), () => get(hitLayer));

	var node_1 = sibling(div_1, 2);

	{
		var consequent_1 = ($$anchor) => {
			var div_2 = root_1$a();
			var span = child(div_2);
			var text = only_child(span, true);
			var node_2 = sibling(span, 2);

			{
				var consequent = ($$anchor) => {
					var span_1 = root$c();
					var text_1 = only_child(span_1, true);

					template_effect(() => set_text(text_1, get(labelDef)));
					append($$anchor, span_1);
				};

				if_block(node_2, ($$render) => {
					if (get(labelDef)) $$render(consequent);
				});
			}
			template_effect(() => set_text(text, get(label)));
			append($$anchor, div_2);
		};

		if_block(node_1, ($$render) => {
			if (get(label)) $$render(consequent_1);
		});
	}

	var node_3 = sibling(node_1, 2);

	{
		var consequent_2 = ($$anchor) => {
			var p = root_2$9();
			var text_2 = only_child(p, true);

			template_effect(() => set_text(text_2, app.starError));
			append($$anchor, p);
		};

		if_block(node_3, ($$render) => {
			if (app.starError) $$render(consequent_2);
		});
	}

	var p_1 = sibling(node_3, 2);
	var text_3 = only_child(p_1);
	var ul = sibling(p_1, 2);

	each(ul, 20, () => app.lit, (name) => name, ($$anchor, name) => {
		var li = root_3$9();
		var button = child(li);
		var text_4 = only_child(button, true);
		template_effect(() => set_text(text_4, name));
		delegated('click', button, () => openConcept(name));
		append($$anchor, li);
	});
	bind_this(div, ($$value) => set(container, $$value), () => get(container));

	template_effect(() => {
		classes = set_class(div, 1, 'starfield', null, classes, { dragging: get(dragging) });
		set_text(text_3, `滚轮缩放 · 拖拽旋转 · Shift+拖拽平移 · 双击复位　${get(zoomLabel) ?? ''}`);
	});

	delegated('keydown', div, onKeydown);
	event('wheel', div, onWheel);
	delegated('pointerdown', div, onPointerDown);
	delegated('pointermove', div, onPointerMove);
	delegated('pointerup', div, onPointerUp);
	event('pointercancel', div, onPointerUp);
	delegated('dblclick', div, onDblClick);
	append($$anchor, div);
	pop();
}

delegate([
	'keydown',
	'pointerdown',
	'pointermove',
	'pointerup',
	'dblclick',
	'click'
]);

var root$b = from_html(`<div><textarea rows="1" spellcheck="false" autocomplete="off" aria-label="问一个点，或描述一片范围"></textarea> <span class="baseline" aria-hidden="true"></span></div>`);

function InputLine($$anchor, $$props) {
	push($$props, true);

	let el = state(null);
	let focused = state(false);

	function autoGrow() {
		if (!get(el)) return;

		get(el).style.height = 'auto';

		const max = Math.round(window.innerHeight * 0.4);

		get(el).style.height = Math.min(get(el).scrollHeight, max) + 'px';
		get(el).style.overflowY = get(el).scrollHeight > max ? 'auto' : 'hidden';
	}

	onMount(() => {
		registerInput({
			focus: () => get(el) && get(el).focus(),
			clear: () => {
				app.input = '';
				autoGrow();
			}
		});

		autoGrow();
	});

	user_effect(() => {
		// 纸页内容变化后输入线高度也要重算（回填长问题时会变高）
		app.input;

		autoGrow();
	});

	function submit() {
		const text = app.input.trim();

		if (!text) return;

		app.input = '';
		autoGrow();
		ask(text, { strategy: 'auto' });
	}

	function onKeydown(event) {
		if (event.key === 'Enter') {
			// 中文 IME：组字中的 Enter 是选词，不是提交
			if (event.isComposing || event.keyCode === 229) return;

			if (event.shiftKey) return; // Shift+Enter 换行

			event.preventDefault();
			submit();
		} else if (event.key === 'Escape') {
			if (app.input) {
				app.input = '';
				autoGrow();
			} else {
				$$props.onEscapeEmpty && $$props.onEscapeEmpty();
			}
		}
	}

	function appendChar(ch) {
		app.input += ch;
		get(el) && get(el).focus();
		autoGrow();
	}

	var $$exports = { appendChar };
	var div = root$b();
	let classes;
	var textarea = child(div);
	bind_this(textarea, ($$value) => set(el, $$value), () => get(el));
	template_effect(() => classes = set_class(div, 1, 'input-line', null, classes, { focused: get(focused) }));
	delegated('input', textarea, autoGrow);
	delegated('keydown', textarea, onKeydown);
	event('focus', textarea, () => set(focused, true));
	event('blur', textarea, () => set(focused, false));
	bind_value(textarea, () => app.input, ($$value) => app.input = $$value);
	append($$anchor, div);

	return pop($$exports);
}

delegate(['input', 'keydown']);

// 引用映射：把正文里的 [n] 标记搬到句末，变成一颗 3–4px 的圆点。
//
// 为什么必须在文本层做：Markdown 渲染之后 DOM 结构由排版决定，句子边界已经丢失，
// 再想去「把标记挂到它所属句子的末尾」就只能猜。所以顺序是固定的：
//   保护代码/行内代码/链接 → 切句 → 摘出 [n] → 句末插占位符 → Markdown → 占位符换按钮。

const MARKER = /\[(\d{1,3}|E\d{1,3})\]/g;
const PROTOCOL = '\u0000'; // 保护段占位；正文里不可能出现
const TOKEN = /⟦cite:([\dE,]+)(\|p)?⟧/g;

/** 保护代码块 / 行内代码 / Markdown 链接，返回还原函数。 */
function protectSegments(text) {
  const kept = [];
  const stash = (value) => {
    kept.push(value);
    return PROTOCOL + (kept.length - 1) + PROTOCOL;
  };
  let out = String(text || '');
  out = out.replace(/`{3}[\s\S]*?`{3}/g, stash);       // 围栏代码块
  out = out.replace(/`[^`\n]+`/g, stash);              // 行内代码
  out = out.replace(/\[[^\]]*\]\([^)]*\)/g, stash);       // 链接
  const restore = (value) =>
    value.replace(new RegExp(PROTOCOL + '(\\d+)' + PROTOCOL, 'g'), (_, i) => kept[Number(i)]);
  return { text: out, restore };
}

function splitSentences(paragraph) {
  const out = [];
  const re = /[^。！？；]*[。！？；]|[^。！？；]+$/g;
  let m;
  while ((m = re.exec(paragraph)) !== null) {
    if (m[0].trim().length) out.push(m[0]);
  }
  return out.length ? out : [paragraph];
}

function uniqueIds(markers) {
  const seen = new Set();
  const out = [];
  for (const id of markers) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.sort((a, b) => Number(a.replace(/^E/, '')) - Number(b.replace(/^E/, '')));
}

function idsOf(text) {
  return [...String(text).matchAll(MARKER)].map((m) => m[1]);
}

/**
 * 句子映射：把 [n] 聚合到句末占位符。
 * finishedOnly：流式阶段只给「已经收尾的句子」插点，最后半句等句号到了再说。
 */
function annotateCitations(source, { finishedOnly = false } = {}) {
  const { text, restore } = protectSegments(source);
  const paragraphs = text.split(/(\n{2,})/);
  let sentenceCount = 0;

  const annotated = paragraphs.map((chunk) => {
    if (/^\n{2,}$/.test(chunk) || !chunk.trim()) return chunk;

    // 段末的标记块：只有当整段不止一句时才按「本段来源」处理
    // （单句段落里的 [n] 属于那句话本身，不是整段引用）
    const trailing = chunk.match(/\s*((?:\[(?:\d{1,3}|E\d{1,3})\]\s*)+)$/);
    let body = chunk;
    let paragraphIds = [];
    if (trailing) {
      body = chunk.slice(0, chunk.length - trailing[0].length);
      paragraphIds = idsOf(trailing[1]);
    }

    const sentences = splitSentences(body).map((sentence) => {
      // 句首的标记属于上一句（它跟在上一句的句号后面）
      const lead = sentence.match(/^(\s*(?:\[(?:\d{1,3}|E\d{1,3})\]\s*)+)/);
      const carry = lead ? idsOf(lead[1]) : [];
      // 标记块后面的那个空格是排版的一部分，摘掉标记后要还回来
      const gap = lead && /\s$/.test(lead[1]) ? ' ' : '';
      const rest = lead ? sentence.slice(lead[1].length) : sentence;
      return { clean: gap + rest.replace(MARKER, ''), ids: uniqueIds(idsOf(rest)), carry };
    });

    // 句首标记回挂到上一句
    for (let i = 1; i < sentences.length; i += 1) {
      if (sentences[i].carry.length) {
        sentences[i - 1].ids = uniqueIds([...sentences[i - 1].ids, ...sentences[i].carry]);
        sentences[i].carry = [];
      }
    }

    const rendered = sentences.map((s, i) => {
      const isLast = i === sentences.length - 1;
      const openEnd = !/[。！？；]\s*$/.test(s.clean.trim()); // 还没收尾的半句
      sentenceCount += 1;
      if (!s.ids.length) return s.clean;
      if (finishedOnly && isLast && openEnd) return s.clean;
      return s.clean + '⟦cite:' + s.ids.join(',') + '⟧';
    });

    if (paragraphIds.length) {
      if (sentences.length === 1) {
        // 单句段落的段末标记就是这句话的来源，按句级处理
        const ids = uniqueIds([...sentences[0].ids, ...paragraphIds]);
        const openEnd = !/[。！？；]\s*$/.test((rendered[0] || '').trim());
        if (!(finishedOnly && openEnd)) rendered[0] = (rendered[0] || '') + '⟦cite:' + ids.join(',') + '⟧';
      } else {
        const lastDone = rendered[rendered.length - 1] || '';
        if (!(finishedOnly && !/[。！？；]\s*$/.test(lastDone.trim()))) {
          rendered[rendered.length - 1] =
            lastDone + '⟦cite:' + uniqueIds(paragraphIds).join(',') + '|p⟧';
        }
      }
    }
    return rendered.join('');
  }).join('');

  return { text: restore(annotated), sentences: sentenceCount };
}

/** 引用点短名：aria-label 与悬停一行都用它，避免整段 citation 文案塞进标签。 */
function shortSource(entry) {
  if (!entry) return '来源';
  const cite = String(entry.citation || entry.unit_title || '').trim();
  const parts = cite.split('·').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return '来源';
  return parts.slice(0, 2).join(' · ');
}

function citationIndex(citations) {
  const map = new Map();
  for (const entry of citations || []) {
    if (entry == null) continue;
    if (entry.n != null) map.set(String(entry.n), entry);
    if (entry.evidence_id) map.set(String(entry.evidence_id), entry);
  }
  return map;
}

/** 占位符 → 圆点按钮（第 6 步）。ids 命中不到的条目只显示一个无标签的点。 */
function replaceCitationTokens(html, citations) {
  const map = citationIndex(citations);
  return String(html || '').replace(TOKEN, (_, ids, paragraphScope) => {
    const list = String(ids).split(',').filter(Boolean);
    const first = map.get(list[0]);
    const label = list.length > 1 ? list.length + ' 条来源' : shortSource(first);
    const scope = paragraphScope ? ' data-scope="paragraph"' : '';
    return '<button type="button" class="cite-dot"' +
      ' data-cites="' + list.join(',') + '"' + scope +
      ' title="' + escapeAttr(label) + '"' +      // 悬停给一行极短来源
      ' aria-label="来源：' + escapeAttr(label) + '"></button>';
  });
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

var root$a = from_html(`<p class="carry-line"> </p>`);
var root_1$9 = from_html(`<p class="intent-line"> <button type="button" class="linkish"> </button></p>`);
var root_2$8 = from_html(`<p class="offer-line">这个问题较大，按范围查询展开？ <button type="button" class="linkish">展开为范围查询</button></p>`);
var root_3$8 = from_html(`<p class="muted-line">没有找到相关的原文。</p> <p class="muted-line">换个说法，或按 / 找一个点。</p>`, 1);
var root_4$8 = from_html(`<p class="muted-line">已跳过检索</p>`);
var root_5$6 = from_html(`<p class="status-line" aria-live="off"> </p>`);
var root_6$6 = from_html(`<p class="error-line"> <button type="button" class="linkish">Enter 重试</button></p>`);
var root_7$5 = from_html(`<div class="block"></div>`);
var root_8$2 = from_html(`<p class="block tail"><!><span class="run"></span></p>`);
var root_9$2 = from_html(`<li><button type="button" class="linkish"> </button></li>`);
var root_10$1 = from_html(`<ul class="constellation-list"></ul>`);
var root_11$1 = from_html(`<div class="constellation"><button type="button" class="linkish"> </button> <!></div>`);
var root_12$1 = from_html(`<p class="hint-line">句末圆点看来源 · S 收藏 · F 打开星匣</p>`);
var root_13$1 = from_html(`<p class="last-line"> <button type="button" class="linkish">回填</button></p>`);
var root_14$1 = from_html(`<article class="answer-paper"><p class="sr-live" aria-live="polite"> </p> <p class="question-line"> <button type="button" class="fav-star inline-star" aria-label="收藏这个问题">✦</button></p> <!> <!> <!> <!> <!> <!> <!> <div class="md"><!> <!> <canvas class="trail" aria-hidden="true"></canvas></div> <!> <!> <!></article>`);

function AnswerPaper($$anchor, $$props) {
	push($$props, true);

	let body = state(null);
	let trail = state(null);
	let runEl = state(null);
	let showHint = state(false);
	let constellationOpen = state(false);

	// 已完成块只渲染一次：同一段原文永远产出同一段 html
	const memo = new Map();

	function blocksHtml() {
		return app.blocks.map((raw) => {
			const cached = memo.get(raw);

			if (cached) return cached;

			const { text } = annotateCitations(raw);
			const html = replaceCitationTokens(renderBlock(text), app.citations);

			memo.set(raw, html);

			return html;
		});
	}

	const tailParts = user_derived(() => {
		const tail = app.tail;
		const cut = Math.max(0, tail.length - (app.runLen || 0));
		const before = tail.slice(0, cut);
		const run = tail.slice(cut);

		const render = (chunk) => {
			if (!chunk) return '';

			const { text } = annotateCitations(chunk, { finishedOnly: true });

			return replaceCitationTokens(renderInline(text), app.citations);
		};

		return { before: render(before), run: render(run) };
	});

	// 引用提示一次性淡入（3 秒），状态存 localStorage
	let hintTimer = 0;

	user_effect(() => {
		if (app.done && !readFlag(LS.citationHint) && app.citations.length) {
			set(showHint, true);
			setFlag(LS.citationHint, true);
			hintTimer = setTimeout(() => set(showHint, false), 3000);
		}
	});

	// ---------------- 字符尾迹：独立 Canvas 叠加层，不参与排版 ----------------
	const points = [];

	let stopTrail = null;
	const trailOff = () => prefersReducedMotion() || isLowPowerDevice();

	function sampleRun() {
		if (trailOff() || !get(trail) || !get(runEl)) return;

		const rects = get(runEl).getClientRects();

		if (!rects || !rects.length) return;

		const box = get(trail).getBoundingClientRect();
		const last = rects[rects.length - 1];

		points.push({
			x: last.right - box.left,
			y: last.top - box.top,
			h: last.height,
			born: performance.now()
		});

		while (points.length > 30) points.shift();

		if (!stopTrail) {
			stopTrail = subscribe(drawTrail);
		}
	}

	function drawTrail() {
		const ctx = get(trail).getContext('2d');
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const rect = get(trail).getBoundingClientRect();

		if (get(trail).width !== Math.floor(rect.width * dpr) || get(trail).height !== Math.floor(rect.height * dpr)) {
			get(trail).width = Math.floor(rect.width * dpr);
			get(trail).height = Math.floor(rect.height * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		ctx.clearRect(0, 0, rect.width, rect.height);

		const now = performance.now();

		while (points.length && now - points[0].born > 520) points.shift();

		for (const p of points) {
			const age = (now - p.born) / 520;
			const alpha = 0.16 * (1 - age);

			ctx.fillStyle = 'rgba(232, 228, 216, ' + alpha.toFixed(3) + ')';
			ctx.fillRect(p.x, p.y + p.h * 0.25, 1, p.h * 0.5);
		}

		if (!points.length && stopTrail) {
			stopTrail();
			stopTrail = null;
		}
	}

	user_effect(() => {
		app.tail;
		app.runLen;
		sampleRun();
	});

	// 定型之后在 DOM 上标出术语命中，再把星点连到那个词（约 600ms 后淡出）
	user_effect(() => {
		if (!app.done || !app.lit.length || !get(body)) return;

		if (!get(body).querySelector('.term-hit')) {
			markTermHits(get(body), app.lit, app.lexicon.index);
		}

		connectTerms(app.lit);
	});

	onDestroy(() => {
		clearTimeout(hintTimer);

		if (stopTrail) stopTrail();
	});

	function onBodyClick(event) {
		const dot = event.target.closest('.cite-dot');

		if (dot) {
			const ids = (dot.dataset.cites || '').split(',').filter(Boolean);
			const picked = app.citations.filter((c) => ids.includes(String(c.n)));
			const list = picked.length ? picked : app.citations;

			setFocus({
				type: 'citation',
				id: list[0] && list[0].chunk_id || '',
				label: shortSource(list[0])
			});

			openSheet(list);

			return;
		}

		// 点正文里的术语 = 「聚焦到一点」：直接发一个「什么是 X？」的点查询
		const term = event.target.closest('.term-hit[data-term]');

		if (term) {
			event.preventDefault();

			setFocus({
				type: 'concept',
				id: term.dataset.term,
				label: term.dataset.term
			});

			ask('什么是' + term.dataset.term + '？', { strategy: 'point' });
		}
	}

	var article = root_14$1();
	var p_1 = child(article);
	var text_1 = only_child(p_1, true);
	var p_2 = sibling(p_1, 2);
	var text_2 = child(p_2);
	var button = sibling(text_2);

	var node = sibling(p_2, 2);

	{
		var consequent = ($$anchor) => {
			var p_3 = root$a();
			var text_3 = only_child(p_3);

			template_effect(() => set_text(text_3, `承自：${app.prevQuestion ?? ''}`));
			append($$anchor, p_3);
		};

		if_block(node, ($$render) => {
			if (app.prevQuestion) $$render(consequent);
		});
	}

	var node_1 = sibling(node, 2);

	{
		var consequent_1 = ($$anchor) => {
			var p_4 = root_1$9();
			var text_4 = child(p_4);
			var button_1 = sibling(text_4);
			var text_5 = only_child(button_1, true);

			template_effect(
				($0) => {
					set_text(text_4, `${$0 ?? ''} `);
					set_text(text_5, app.intent === 'theme' ? '聚焦到一点' : '改成范围查询');
				},
				[() => intentLine()]
			);

			delegated('click', button_1, () => switchIntent(app.intent === 'theme' ? 'point' : 'theme'));
			append($$anchor, p_4);
		};

		if_block(node_1, ($$render) => {
			if (app.conversationId !== null || app.done || app.streaming) $$render(consequent_1);
		});
	}

	var node_2 = sibling(node_1, 2);

	{
		var consequent_2 = ($$anchor) => {
			var p_5 = root_2$8();
			var button_2 = sibling(child(p_5));
			delegated('click', button_2, () => switchIntent('theme'));
			append($$anchor, p_5);
		};

		if_block(node_2, ($$render) => {
			if (app.clarifyOffer) $$render(consequent_2);
		});
	}

	var node_3 = sibling(node_2, 2);

	{
		var consequent_3 = ($$anchor) => {
			var fragment = root_3$8();
			append($$anchor, fragment);
		};

		if_block(node_3, ($$render) => {
			if (app.empty) $$render(consequent_3);
		});
	}

	var node_4 = sibling(node_3, 2);

	{
		var consequent_4 = ($$anchor) => {
			var p_6 = root_4$8();

			append($$anchor, p_6);
		};

		if_block(node_4, ($$render) => {
			if (app.skipped) $$render(consequent_4);
		});
	}

	var node_5 = sibling(node_4, 2);

	{
		var consequent_5 = ($$anchor) => {
			var p_7 = root_5$6();
			var text_6 = only_child(p_7, true);

			template_effect(() => set_text(text_6, app.status));
			append($$anchor, p_7);
		};

		if_block(node_5, ($$render) => {
			if (app.status) $$render(consequent_5);
		});
	}

	var node_6 = sibling(node_5, 2);

	{
		var consequent_6 = ($$anchor) => {
			var p_8 = root_6$6();
			var text_7 = child(p_8);
			var button_3 = sibling(text_7);
			template_effect(() => set_text(text_7, `${app.error ?? ''} `));
			delegated('click', button_3, () => ask(app.question, { strategy: app.strategy }));
			append($$anchor, p_8);
		};

		if_block(node_6, ($$render) => {
			if (app.error) $$render(consequent_6);
		});
	}

	var div = sibling(node_6, 2);
	var node_7 = child(div);

	each(node_7, 17, blocksHtml, index, ($$anchor, html$1) => {
		var div_1 = root_7$5();

		html(div_1, () => get(html$1), true);
		append($$anchor, div_1);
	});

	var node_8 = sibling(node_7, 2);

	{
		var consequent_7 = ($$anchor) => {
			var p_9 = root_8$2();
			var node_9 = child(p_9);

			html(node_9, () => get(tailParts).before);

			var span = sibling(node_9);

			html(span, () => get(tailParts).run, true);
			bind_this(span, ($$value) => set(runEl, $$value), () => get(runEl));
			append($$anchor, p_9);
		};

		if_block(node_8, ($$render) => {
			if (app.tail) $$render(consequent_7);
		});
	}

	var canvas = sibling(node_8, 2);

	bind_this(canvas, ($$value) => set(trail, $$value), () => get(trail));
	bind_this(div, ($$value) => set(body, $$value), () => get(body));

	var node_10 = sibling(div, 2);

	{
		var consequent_9 = ($$anchor) => {
			var div_2 = root_11$1();
			var button_4 = child(div_2);
			var text_8 = only_child(button_4);
			var node_11 = sibling(button_4, 2);

			{
				var consequent_8 = ($$anchor) => {
					var ul = root_10$1();

					each(ul, 20, () => app.lit, (name) => name, ($$anchor, name) => {
						var li = root_9$2();
						var button_5 = child(li);
						var text_9 = only_child(button_5, true);
						template_effect(() => set_text(text_9, name));
						delegated('click', button_5, () => ask('什么是' + name + '？', { strategy: 'point' }));
						append($$anchor, li);
					});
					append($$anchor, ul);
				};

				if_block(node_11, ($$render) => {
					if (get(constellationOpen)) $$render(consequent_8);
				});
			}
			template_effect(() => set_text(text_8, `已点亮星座 ┆ ${app.lit.length ?? ''}`));
			delegated('click', button_4, () => set(constellationOpen, !get(constellationOpen)));
			append($$anchor, div_2);
		};

		if_block(node_10, ($$render) => {
			if (app.done && app.lit.length && app.intent === 'theme') $$render(consequent_9);
		});
	}

	var node_12 = sibling(node_10, 2);

	{
		var consequent_10 = ($$anchor) => {
			var p_10 = root_12$1();

			append($$anchor, p_10);
		};

		if_block(node_12, ($$render) => {
			if (get(showHint)) $$render(consequent_10);
		});
	}

	var node_13 = sibling(node_12, 2);

	{
		var consequent_11 = ($$anchor) => {
			var p_11 = root_13$1();
			var text_10 = child(p_11);
			var button_6 = sibling(text_10);
			template_effect(() => set_text(text_10, `上次问到这里：${app.question ?? ''} `));

			delegated('click', button_6, () => {
				app.input = app.question;
			});

			append($$anchor, p_11);
		};

		var d = user_derived(() => !app.input.trim() && app.done && app.question);

		if_block(node_13, ($$render) => {
			if (get(d)) $$render(consequent_11);
		});
	}

	template_effect(() => {
		set_attribute(article, 'aria-busy', app.streaming ? 'true' : 'false');
		set_text(text_1, app.done ? '回答已完成' : '');
		set_text(text_2, `${app.question ?? ''} `);
	});

	event('focus', button, () => setFocus({ type: 'question', id: app.question, label: app.question }));

	delegated('click', button, function (...$$args) {
		favoriteFocused?.apply(this, $$args);
	});

	delegated('click', div, onBodyClick);
	append($$anchor, article);
	pop();
}

delegate(['click']);

var root$9 = from_html(`<p class="carry-line"> </p>`);
var root_1$8 = from_html(`<section class="seg"><p class="body-text"> </p> <p class="faint"> </p></section>`);
var root_2$7 = from_html(`<li><button type="button" class="linkish"> </button> <span class="faint"> </span></li>`);
var root_3$7 = from_html(`<section class="seg"><h3>单元分布</h3> <ul class="inline-list"></ul></section>`);
var root_4$7 = from_html(`<li> <span class="faint"> </span></li>`);
var root_5$5 = from_html(`<section class="seg"><h3>理论家</h3> <ul class="inline-list"></ul></section>`);
var root_6$5 = from_html(`<section class="seg"><h3>相关概念</h3> <ul class="inline-list"></ul></section>`);
var root_7$4 = from_html(`<section class="seg"><h3>所属主题</h3> <p class="body-text"> </p></section>`);
var root_8$1 = from_html(`<blockquote class="quote-block"><p> </p> <p class="faint"> <button type="button" class="linkish">看来源</button></p></blockquote>`);
var root_9$1 = from_html(`<section class="seg"><h3>引文</h3> <!></section>`);
var root_10 = from_html(`<!> <!> <!> <!> <!> <!>`, 1);
var root_11 = from_html(`<div class="quote-block"><p> </p> <p class="faint"> <button type="button" class="linkish">定于此</button></p></div>`);
var root_12 = from_html(`<section class="seg"><h3>语义检索</h3> <!></section>`);
var root_13 = from_html(`<p class="muted-line">词典未收录这个概念。</p> <!>`, 1);
var root_14 = from_html(`<article class="concept-paper"><p class="question-line"> </p> <!> <!> <p class="paper-footer"><button type="button" class="linkish">问这个点</button> <button type="button" class="linkish">展开为范围查询</button></p></article>`);

function ConceptPaper($$anchor, $$props) {
	push($$props, true);

	const card = user_derived(() => app.concept || {});
	const definition = user_derived(() => get(card).definition || null);
	const semantic = user_derived(() => get(card).semantic || null);
	var article = root_14();
	var p_1 = child(article);
	var text = only_child(p_1, true);
	var node = sibling(p_1, 2);

	{
		var consequent = ($$anchor) => {
			var p_2 = root$9();
			var text_1 = only_child(p_2);

			template_effect(($0) => set_text(text_1, `别名：${$0 ?? ''}`), [() => get(card).aliases.join(' / ')]);
			append($$anchor, p_2);
		};

		if_block(node, ($$render) => {
			if (get(card).aliases && get(card).aliases.length) $$render(consequent);
		});
	}

	var node_1 = sibling(node, 2);

	{
		var consequent_7 = ($$anchor) => {
			var fragment = root_10();
			var node_2 = first_child(fragment);

			{
				var consequent_1 = ($$anchor) => {
					var section = root_1$8();
					var p_3 = child(section);
					var text_2 = only_child(p_3, true);
					var p_4 = sibling(p_3, 2);
					var text_3 = only_child(p_4, true);

					template_effect(() => {
						set_text(text_2, get(definition).text);
						set_text(text_3, get(definition).citation);
					});

					append($$anchor, section);
				};

				if_block(node_2, ($$render) => {
					if (get(definition)) $$render(consequent_1);
				});
			}

			var node_3 = sibling(node_2, 2);

			{
				var consequent_2 = ($$anchor) => {
					var section_1 = root_3$7();
					var ul = sibling(child(section_1), 2);

					each(ul, 21, () => get(card).units, (u) => u.code, ($$anchor, u) => {
						var li = root_2$7();
						var button = child(li);
						var text_4 = only_child(button);
						var span = sibling(button, 2);
						var text_5 = only_child(span, true);

						template_effect(() => {
							set_text(text_4, `${get(u).code ?? ''} ${(get(u).title || '') ?? ''}`);
							set_text(text_5, get(u).hits);
						});

						delegated('click', button, () => setFocus({
							type: 'concept',
							id: get(card).term,
							label: get(card).term
						}));

						append($$anchor, li);
					});
					append($$anchor, section_1);
				};

				if_block(node_3, ($$render) => {
					if (get(card).units && get(card).units.length) $$render(consequent_2);
				});
			}

			var node_4 = sibling(node_3, 2);

			{
				var consequent_3 = ($$anchor) => {
					var section_2 = root_5$5();
					var ul_1 = sibling(child(section_2), 2);

					each(ul_1, 21, () => get(card).philosophers, (p) => p.name, ($$anchor, p) => {
						var li_1 = root_4$7();
						var text_6 = child(li_1);
						var span_1 = sibling(text_6);
						var text_7 = only_child(span_1, true);

						template_effect(() => {
							set_text(text_6, get(p).name);
							set_text(text_7, get(p).count);
						});

						append($$anchor, li_1);
					});
					append($$anchor, section_2);
				};

				if_block(node_4, ($$render) => {
					if (get(card).philosophers && get(card).philosophers.length) $$render(consequent_3);
				});
			}

			var node_5 = sibling(node_4, 2);

			{
				var consequent_4 = ($$anchor) => {
					var section_3 = root_6$5();
					var ul_2 = sibling(child(section_3), 2);

					each(ul_2, 21, () => get(card).related, (r) => r.name, ($$anchor, r) => {
						var li_2 = root_2$7();
						var button_1 = child(li_2);
						var text_8 = only_child(button_1, true);
						var span_2 = sibling(button_1, 2);
						var text_9 = only_child(span_2, true);

						template_effect(() => {
							set_text(text_8, get(r).name);
							set_text(text_9, get(r).count);
						});

						delegated('click', button_1, () => ask('什么是' + get(r).name + '？', { strategy: 'point' }));
						append($$anchor, li_2);
					});
					append($$anchor, section_3);
				};

				if_block(node_5, ($$render) => {
					if (get(card).related && get(card).related.length) $$render(consequent_4);
				});
			}

			var node_6 = sibling(node_5, 2);

			{
				var consequent_5 = ($$anchor) => {
					var section_4 = root_7$4();
					var p_5 = sibling(child(section_4), 2);
					var text_10 = only_child(p_5, true);
					template_effect(($0) => set_text(text_10, $0), [() => get(card).themes.join('　')]);
					append($$anchor, section_4);
				};

				if_block(node_6, ($$render) => {
					if (get(card).themes && get(card).themes.length) $$render(consequent_5);
				});
			}

			var node_7 = sibling(node_6, 2);

			{
				var consequent_6 = ($$anchor) => {
					var section_5 = root_9$1();
					var node_8 = sibling(child(section_5), 2);

					each(node_8, 17, () => get(card).quotes, (q) => q.chunk_id, ($$anchor, q) => {
						var blockquote = root_8$1();
						var p_6 = child(blockquote);
						var text_11 = only_child(p_6, true);
						var p_7 = sibling(p_6, 2);
						var text_12 = child(p_7);
						var button_2 = sibling(text_12);

						template_effect(() => {
							set_text(text_11, get(q).text);
							set_text(text_12, `${(get(q).speaker || '未署名') ?? ''}　${get(q).citation ?? ''} `);
						});

						delegated('click', button_2, () => openSheet(
							[
								{
									...get(q),
									n: 1,
									citation: get(q).citation,
									text: get(q).text,
									chunk_id: get(q).chunk_id
								}
							]));

						append($$anchor, blockquote);
					});
					append($$anchor, section_5);
				};

				if_block(node_7, ($$render) => {
					if (get(card).quotes && get(card).quotes.length) $$render(consequent_6);
				});
			}

			append($$anchor, fragment);
		};

		var alternate = ($$anchor) => {
			var fragment_1 = root_13();
			var node_9 = sibling(first_child(fragment_1), 2);

			{
				var consequent_8 = ($$anchor) => {
					var section_6 = root_12();
					var node_10 = sibling(child(section_6), 2);

					each(
						node_10,
						17,
						() => [
							...get(semantic).exact_hits || [],
							...get(semantic).semantic_hits || []
						].slice(0, 6),
						(hit) => hit.chunk_id,
						($$anchor, hit) => {
							var div = root_11();
							var p_8 = child(div);
							var text_13 = only_child(p_8, true);
							var p_9 = sibling(p_8, 2);
							var text_14 = child(p_9);
							var button_3 = sibling(text_14);

							template_effect(() => {
								set_text(text_13, get(hit).text);
								set_text(text_14, `${get(hit).citation ?? ''} `);
							});

							delegated('click', button_3, () => setFocus({
								type: 'citation',
								id: get(hit).chunk_id,
								label: get(hit).citation
							}));

							append($$anchor, div);
						}
					);
					append($$anchor, section_6);
				};

				if_block(node_9, ($$render) => {
					if (get(semantic) && (get(semantic).exact_hits?.length || get(semantic).semantic_hits?.length)) $$render(consequent_8);
				});
			}

			append($$anchor, fragment_1);
		};

		if_block(node_1, ($$render) => {
			if (get(card).found) $$render(consequent_7); else $$render(alternate, -1);
		});
	}

	var p_10 = sibling(node_1, 2);
	var button_4 = child(p_10);
	var button_5 = sibling(button_4, 2);
	template_effect(() => set_text(text, get(card).term || app.question));
	delegated('click', button_4, () => ask('什么是' + (get(card).term || app.question) + '？', { strategy: 'point' }));
	delegated('click', button_5, () => ask(get(card).term || app.question, { strategy: 'theme' }));
	append($$anchor, article);
	pop();
}

delegate(['click']);

var root$8 = from_html(`<th> </th>`);
var root_1$7 = from_html(`<button type="button" class="linkish"> <br/><span class="faint"> </span></button>`);
var root_2$6 = from_html(`<span class="faint">—</span>`);
var root_3$6 = from_html(`<td><!></td>`);
var root_4$6 = from_html(`<tr><th> </th><!></tr>`);
var root_5$4 = from_html(`<li> </li>`);
var root_6$4 = from_html(`<li><button type="button" class="linkish"> </button></li>`);
var root_7$3 = from_html(`<article class="map-paper"><p class="question-line">体系地图</p> <p class="carry-line">4×4 字头 × 位面：仅用于单元浏览，不是星图的布局</p> <table class="unit-grid"><thead><tr><th></th><!></tr></thead><tbody></tbody></table> <section class="seg"><h3>卷与单元</h3> <ul class="inline-list"></ul> <p class="faint"> </p></section> <section class="seg"><h3>未归入网格的单元</h3> <ul class="inline-list"></ul></section></article>`);

function SystemMapPaper($$anchor, $$props) {
	push($$props, true);

	const units = user_derived(() => app.lexicon.units || []);
	const axes = user_derived(() => app.lexicon.axes || {});
	const heads = user_derived(() => get(axes)['字头'] || []);
	const layers = user_derived(() => get(axes)['四层'] || []);

	// 4×4 只服务「单元浏览」：格子里是编号两位的单元（1-2 这种），不是星图布局
	const byCode = user_derived(() => {
		const map = new Map();

		for (const u of get(units)) if (u.depth === 2) map.set(u.code, u);

		return map;
	});

	const grid = user_derived(() => (get(heads).length
		? get(heads)
		: [1, 2, 3, 4].map((n) => ({ code: String(n), name: String(n) }))).map((h) => (get(layers).length
		? get(layers)
		: [1, 2, 3, 4].map((n) => ({ code: String(n), name: String(n) }))).map((l) => ({
		head: h,
		layer: l,
		unit: get(byCode).get(h.code + '-' + l.code) || null
	}))));

	const loose = user_derived(() => get(units).filter((u) => u.depth > 2));

	const volumes = user_derived(() => [
		...new Set(get(units).filter((u) => u.depth === 1).map((u) => u.volume))
	]);

	var article = root_7$3();
	var table = sibling(child(article), 4);
	var thead = child(table);
	var tr = child(thead);
	var node = sibling(child(tr));

	each(node, 17, () => get(grid)[0] || [], (cell) => cell.layer.code, ($$anchor, cell) => {
		var th = root$8();
		var text = only_child(th, true);

		template_effect(() => set_text(text, get(cell).layer.name));
		append($$anchor, th);
	});

	var tbody = sibling(thead);

	each(tbody, 21, () => get(grid), index, ($$anchor, row) => {
		var tr_1 = root_4$6();
		var th_1 = child(tr_1);
		var text_1 = only_child(th_1, true);
		var node_1 = sibling(th_1);

		each(node_1, 17, () => get(row), (cell) => cell.layer.code, ($$anchor, cell) => {
			var td = root_3$6();
			var node_2 = child(td);

			{
				var consequent = ($$anchor) => {
					var button = root_1$7();
					var text_2 = child(button);
					var span = sibling(text_2, 2);
					var text_3 = only_child(span, true);

					template_effect(() => {
						set_text(text_2, get(cell).unit.code);
						set_text(text_3, get(cell).unit.title);
					});

					delegated('click', button, () => openUnit(get(cell).unit.code));
					append($$anchor, button);
				};

				var alternate = ($$anchor) => {
					var span_1 = root_2$6();

					append($$anchor, span_1);
				};

				if_block(node_2, ($$render) => {
					if (get(cell).unit) $$render(consequent); else $$render(alternate, -1);
				});
			}
			append($$anchor, td);
		});
		template_effect(() => set_text(text_1, get(row)[0]?.head.name));
		append($$anchor, tr_1);
	});

	var section = sibling(table, 2);
	var ul = sibling(child(section), 2);

	each(ul, 20, () => get(volumes), (v) => v, ($$anchor, v) => {
		var li = root_5$4();
		var text_4 = only_child(li, true);

		template_effect(() => set_text(text_4, v));
		append($$anchor, li);
	});

	var p = sibling(ul, 2);
	var text_5 = only_child(p);

	var section_1 = sibling(section, 2);
	var ul_1 = sibling(child(section_1), 2);

	each(ul_1, 21, () => get(loose), (u) => u.code + u.title, ($$anchor, u) => {
		var li_1 = root_6$4();
		var button_1 = child(li_1);
		var text_6 = only_child(button_1);
		template_effect(() => set_text(text_6, `${get(u).code ?? ''} ${get(u).title ?? ''}`));
		delegated('click', button_1, () => openUnit(get(u).code));
		append($$anchor, li_1);
	});
	template_effect(() => set_text(text_5, `共 ${get(units).length ?? ''} 个单元条目，${get(loose).length ?? ''} 个在网格之外（三级及更深）。`));
	append($$anchor, article);
	pop();
}

delegate(['click']);

var root$7 = from_html(`<p class="faint"> </p>`);
var root_1$6 = from_html(`<li><button type="button" class="linkish"> </button></li>`);
var root_2$5 = from_html(`<section class="seg"><h3>子单元</h3> <ul class="inline-list"></ul></section>`);
var root_3$5 = from_html(`<li><button type="button" class="linkish"> </button> <span class="faint"> </span></li>`);
var root_4$5 = from_html(`<li> <span class="faint"> </span></li>`);
var root_5$3 = from_html(`<section class="seg"><h3>本单元术语与理论家</h3> <ul class="inline-list"></ul> <ul class="inline-list"></ul></section>`);
var root_6$3 = from_html(`<div class="quote-block"><p> </p> <p class="faint"> <!></p></div>`);
var root_7$2 = from_html(`<article class="unit-paper" tabindex="0"><p class="question-line"> </p> <p class="carry-line"> </p> <!> <!> <!> <section class="seg"></section> <p class="paper-footer"><button type="button" class="linkish">用该单元提问</button> <button type="button" class="linkish">本单元引文</button></p></article>`);

function UnitPaper($$anchor, $$props) {
	push($$props, true);

	let scroller = state(null);
	let scale = state(1);
	const unit = user_derived(() => app.unit || {});

	function applyScale() {
		if (!get(scroller)) return;

		get(scroller).style.fontSize = (16 * get(scale)).toFixed(2) + 'px';
	}

	onMount(() => {
		applyScale();

		if (get(unit).savedScroll) get(scroller).scrollTop = get(unit).savedScroll;
	});

	function onKeydown(event) {
		if (!(event.ctrlKey || event.metaKey)) return;

		if (event.key === '=' || event.key === '+') {
			event.preventDefault();
			set(scale, Math.min(1.6, get(scale) + 0.1), true);
			applyScale();
		} else if (event.key === '-') {
			event.preventDefault();
			set(scale, Math.max(0.8, get(scale) - 0.1), true);
			applyScale();
		} else if (event.key === '0') {
			event.preventDefault();
			set(scale, 1);
			applyScale();
		}
	}

	function rememberScroll() {
		if (!get(scroller) || !get(unit).code) return;

		setReadPos({ code: get(unit).code, scrollTop: get(scroller).scrollTop });
	}

	async function showQuotes() {
		const payload = await api.quote({ unit: get(unit).code, limit: 12 }).catch(() => null);

		if (payload) app.unit.quotes = payload.quotes || [];
	}

	var article = root_7$2();
	var p_1 = child(article);
	var text$1 = only_child(p_1);
	var p_2 = sibling(p_1, 2);
	var text_1 = only_child(p_2);
	var node = sibling(p_2, 2);

	{
		var consequent = ($$anchor) => {
			var p_3 = root$7();
			var text_2 = only_child(p_3);

			template_effect(() => set_text(text_2, `原文块 ${get(unit).counts.chunks ?? ''}　引文 ${get(unit).counts.quotes ?? ''}`));
			append($$anchor, p_3);
		};

		if_block(node, ($$render) => {
			if (get(unit).counts) $$render(consequent);
		});
	}

	var node_1 = sibling(node, 2);

	{
		var consequent_1 = ($$anchor) => {
			var section = root_2$5();
			var ul = sibling(child(section), 2);

			each(ul, 21, () => get(unit).children, (child) => child.code, ($$anchor, child$1) => {
				var li = root_1$6();
				var button = child(li);
				var text_3 = only_child(button);
				template_effect(() => set_text(text_3, `${get(child$1).code ?? ''} ${get(child$1).title ?? ''}`));
				delegated('click', button, () => openUnit(get(child$1).code));
				append($$anchor, li);
			});
			append($$anchor, section);
		};

		if_block(node_1, ($$render) => {
			if (get(unit).children && get(unit).children.length) $$render(consequent_1);
		});
	}

	var node_2 = sibling(node_1, 2);

	{
		var consequent_2 = ($$anchor) => {
			var section_1 = root_5$3();
			var ul_1 = sibling(child(section_1), 2);

			each(ul_1, 21, () => get(unit).concepts || [], (c) => c.name, ($$anchor, c) => {
				var li_1 = root_3$5();
				var button_1 = child(li_1);
				var text_4 = only_child(button_1, true);
				var span = sibling(button_1, 2);
				var text_5 = only_child(span, true);

				template_effect(() => {
					set_text(text_4, get(c).name);
					set_text(text_5, get(c).count);
				});

				delegated('click', button_1, () => setFocus({ type: 'concept', id: get(c).name, label: get(c).name }));
				append($$anchor, li_1);
			});

			var ul_2 = sibling(ul_1, 2);

			each(ul_2, 21, () => get(unit).philosophers || [], (p) => p.name, ($$anchor, p) => {
				var li_2 = root_4$5();
				var text_6 = child(li_2);
				var span_1 = sibling(text_6);
				var text_7 = only_child(span_1, true);

				template_effect(() => {
					set_text(text_6, get(p).name);
					set_text(text_7, get(p).count);
				});

				append($$anchor, li_2);
			});
			append($$anchor, section_1);
		};

		if_block(node_2, ($$render) => {
			if (get(unit).concepts && get(unit).concepts.length || get(unit).philosophers && get(unit).philosophers.length) $$render(consequent_2);
		});
	}

	var section_2 = sibling(node_2, 2);

	each(section_2, 21, () => get(unit).items || [], (item) => item.chunk_id, ($$anchor, item) => {
		var div = root_6$3();
		var p_4 = child(div);
		var text_8 = only_child(p_4, true);
		var p_5 = sibling(p_4, 2);
		var text_9 = child(p_5);
		var node_3 = sibling(text_9);

		{
			var consequent_3 = ($$anchor) => {
				var text_10 = text();

				template_effect(($0) => set_text(text_10, `　${$0 ?? ''}`), [() => get(item).concepts.slice(0, 4).join('、')]);
				append($$anchor, text_10);
			};

			if_block(node_3, ($$render) => {
				if (get(item).concepts && get(item).concepts.length) $$render(consequent_3);
			});
		}

		template_effect(() => {
			set_text(text_8, get(item).text);
			set_text(text_9, `${get(item).citation ?? ''} `);
		});

		append($$anchor, div);
	});

	var p_6 = sibling(section_2, 2);
	var button_2 = child(p_6);
	var button_3 = sibling(button_2, 2);
	bind_this(article, ($$value) => set(scroller, $$value), () => get(scroller));

	template_effect(
		($0) => {
			set_text(text$1, `${get(unit).code ?? ''} ${(get(unit).title || '') ?? ''}`);
			set_text(text_1, `${(get(unit).volume || '') ?? ''}　${(get(unit).head || '') ?? ''}　${$0 ?? ''}`);
		},
		[() => get(unit).coords ? get(unit).coords.join('　') : '']
	);

	delegated('keydown', article, onKeydown);
	event('scroll', article, rememberScroll);
	delegated('click', button_2, () => ask(get(unit).title || get(unit).code, { strategy: 'point' }));
	delegated('click', button_3, showQuotes);
	append($$anchor, article);
	pop();
}

delegate(['keydown', 'click']);

var root$6 = from_html(`<p class="muted-line">还差一个概念。在低语层里用「对 A ↔ B」再试一次。</p>`);
var root_1$5 = from_html(`<p class="body-text"> </p>`);
var root_2$4 = from_html(`<p class="faint"> </p>`);
var root_3$4 = from_html(`<div><p class="faint"> </p> <!> <!> <!></div>`);
var root_4$4 = from_html(`<li> <span class="faint"> </span></li>`);
var root_5$2 = from_html(`<p class="faint">共享</p> <ul class="inline-list"></ul>`, 1);
var root_6$2 = from_html(`<blockquote class="quote-block"><p> </p> <p class="faint"> <button type="button" class="linkish">看来源</button></p></blockquote>`);
var root_7$1 = from_html(`<div></div>`);
var root_8 = from_html(`<section class="seg"><h3>定义与归属</h3> <div class="two-col"></div></section> <section class="seg"><h3>共享与独有共现</h3> <!> <div class="two-col"><div><p class="faint"> </p> <ul class="inline-list"></ul></div> <div><p class="faint"> </p> <ul class="inline-list"></ul></div></div></section> <section class="seg"><h3>两侧引文</h3> <div class="two-col"></div></section>`, 1);
var root_9 = from_html(`<article class="compare-paper"><p class="question-line"> </p> <!></article>`);

function ComparePaper($$anchor, $$props) {
	push($$props, true);

	const compare = user_derived(() => app.compare || null);
	const left = user_derived(() => get(compare) && get(compare).terms ? get(compare).terms[0] : null);
	const right = user_derived(() => get(compare) && get(compare).terms ? get(compare).terms[1] : null);
	var article = root_9();
	var p_1 = child(article);
	var text = only_child(p_1);
	var node = sibling(p_1, 2);

	{
		var consequent = ($$anchor) => {
			var p_2 = root$6();

			append($$anchor, p_2);
		};

		var alternate = ($$anchor) => {
			var fragment = root_8();
			var section = first_child(fragment);
			var div = sibling(child(section), 2);

			each(div, 21, () => [get(left), get(right)], index, ($$anchor, side) => {
				var div_1 = root_3$4();
				var p_3 = child(div_1);
				var text_1 = only_child(p_3);
				var node_1 = sibling(p_3, 2);

				{
					var consequent_1 = ($$anchor) => {
						var p_4 = root_1$5();
						var text_2 = only_child(p_4, true);

						template_effect(() => set_text(text_2, get(side).definition));
						append($$anchor, p_4);
					};

					if_block(node_1, ($$render) => {
						if (get(side).definition) $$render(consequent_1);
					});
				}

				var node_2 = sibling(node_1, 2);

				{
					var consequent_2 = ($$anchor) => {
						var p_5 = root_2$4();
						var text_3 = only_child(p_5);

						template_effect(($0) => set_text(text_3, `主题：${$0 ?? ''}`), [() => get(side).themes.join('　')]);
						append($$anchor, p_5);
					};

					if_block(node_2, ($$render) => {
						if (get(side).themes && get(side).themes.length) $$render(consequent_2);
					});
				}

				var node_3 = sibling(node_2, 2);

				{
					var consequent_3 = ($$anchor) => {
						var p_6 = root_2$4();
						var text_4 = only_child(p_6);

						template_effect(($0) => set_text(text_4, `理论家：${$0 ?? ''}`), [
							() => get(side).philosophers.slice(0, 5).map((p) => p.name).join('、')
						]);

						append($$anchor, p_6);
					};

					if_block(node_3, ($$render) => {
						if (get(side).philosophers && get(side).philosophers.length) $$render(consequent_3);
					});
				}
				template_effect(() => set_text(text_1, `${get(side).term ?? ''}${get(side).found ? '' : '（词典未收录）'}`));
				append($$anchor, div_1);
			});

			var section_1 = sibling(section, 2);
			var node_4 = sibling(child(section_1), 2);

			{
				var consequent_4 = ($$anchor) => {
					var fragment_1 = root_5$2();
					var ul = sibling(first_child(fragment_1), 2);

					each(ul, 21, () => get(compare).shared_related, (row) => row.name, ($$anchor, row) => {
						var li = root_4$4();
						var text_5 = child(li);
						var span = sibling(text_5);
						var text_6 = only_child(span);

						template_effect(() => {
							set_text(text_5, get(row).name);
							set_text(text_6, `${get(row).a ?? ''} / ${get(row).b ?? ''}`);
						});

						append($$anchor, li);
					});
					append($$anchor, fragment_1);
				};

				if_block(node_4, ($$render) => {
					if (get(compare).shared_related && get(compare).shared_related.length) $$render(consequent_4);
				});
			}

			var div_2 = sibling(node_4, 2);
			var div_3 = child(div_2);
			var p_7 = child(div_3);
			var text_7 = only_child(p_7);
			var ul_1 = sibling(p_7, 2);

			each(ul_1, 21, () => get(compare).a_only_related || [], (row) => row.name, ($$anchor, row) => {
				var li_1 = root_4$4();
				var text_8 = child(li_1);
				var span_1 = sibling(text_8);
				var text_9 = only_child(span_1, true);

				template_effect(() => {
					set_text(text_8, get(row).name);
					set_text(text_9, get(row).count);
				});

				append($$anchor, li_1);
			});

			var div_4 = sibling(div_3, 2);
			var p_8 = child(div_4);
			var text_10 = only_child(p_8);
			var ul_2 = sibling(p_8, 2);

			each(ul_2, 21, () => get(compare).b_only_related || [], (row) => row.name, ($$anchor, row) => {
				var li_2 = root_4$4();
				var text_11 = child(li_2);
				var span_2 = sibling(text_11);
				var text_12 = only_child(span_2, true);

				template_effect(() => {
					set_text(text_11, get(row).name);
					set_text(text_12, get(row).count);
				});

				append($$anchor, li_2);
			});

			var section_2 = sibling(section_1, 2);
			var div_5 = sibling(child(section_2), 2);

			each(div_5, 21, () => [get(left), get(right)], index, ($$anchor, side) => {
				var div_6 = root_7$1();

				each(div_6, 21, () => get(side)?.quotes || [], (q) => q.chunk_id, ($$anchor, q) => {
					var blockquote = root_6$2();
					var p_9 = child(blockquote);
					var text_13 = only_child(p_9, true);
					var p_10 = sibling(p_9, 2);
					var text_14 = child(p_10);
					var button = sibling(text_14);

					template_effect(() => {
						set_text(text_13, get(q).text);
						set_text(text_14, `${(get(q).speaker || '未署名') ?? ''}　${get(q).citation ?? ''} `);
					});

					delegated('click', button, () => openSheet([{ ...get(q), n: 1 }]));
					append($$anchor, blockquote);
				});
				append($$anchor, div_6);
			});

			template_effect(() => {
				set_text(text_7, `只有 ${get(left)?.term ?? ''}`);
				set_text(text_10, `只有 ${get(right)?.term ?? ''}`);
			});

			append($$anchor, fragment);
		};

		if_block(node, ($$render) => {
			if (!get(compare)) $$render(consequent); else $$render(alternate, -1);
		});
	}
	template_effect(() => set_text(text, `${(get(left)?.term || '') ?? ''} ↔ ${(get(right)?.term || '') ?? ''}`));
	append($$anchor, article);
	pop();
}

delegate(['click']);

var root$5 = from_html(`<div role="group" aria-label="纸页与收藏"><div class="paper" tabindex="0" role="region" aria-label="纸页"><!></div> <button type="button" class="fav-star" aria-label="收藏这页">✦</button></div>`);

function Paper($$anchor, $$props) {
	push($$props, true);

	let hovered = state(false);
	var div = root$5();
	let classes;
	var div_1 = child(div);
	var node = child(div_1);

	{
		var consequent = ($$anchor) => {
			AnswerPaper($$anchor, {});
		};

		var consequent_1 = ($$anchor) => {
			ConceptPaper($$anchor, {});
		};

		var consequent_2 = ($$anchor) => {
			SystemMapPaper($$anchor, {});
		};

		var consequent_3 = ($$anchor) => {
			UnitPaper($$anchor, {});
		};

		var consequent_4 = ($$anchor) => {
			ComparePaper($$anchor, {});
		};

		if_block(node, ($$render) => {
			if (app.paperKind === 'answer') $$render(consequent); else if (app.paperKind === 'concept') $$render(consequent_1, 1); else if (app.paperKind === 'map') $$render(consequent_2, 2); else if (app.paperKind === 'unit') $$render(consequent_3, 3); else if (app.paperKind === 'compare') $$render(consequent_4, 4);
		});
	}

	var button = sibling(div_1, 2);
	template_effect(() => classes = set_class(div, 1, 'paper-wrap', null, classes, { 'corner-star': get(hovered) }));
	event('mouseenter', div, () => set(hovered, true));
	event('mouseleave', div, () => set(hovered, false));

	event('focus', button, () => {
		if (app.paperKind === 'answer') setFocus({ type: 'answer', id: app.answerId, label: app.question });
	});

	delegated('click', button, function (...$$args) {
		favoriteFocused?.apply(this, $$args);
	});

	append($$anchor, div);
	pop();
}

delegate(['click']);

var root$4 = from_html(`<span class="count" aria-hidden="true"> </span>`);
var root_1$4 = from_html(`<button type="button" class="cite-dot"><span class="dot" aria-hidden="true"></span> <!></button>`);

function CitationDot($$anchor, $$props) {
	// 句末圆点：3–4px，命中区 24×24px；aria-label 用短来源名。
	let label = prop($$props, 'label', 3, '来源'),
		cites = prop($$props, 'cites', 3, ''),
		counts = prop($$props, 'counts', 3, 0);

	var button = root_1$4();
	var node = sibling(child(button), 2);

	{
		var consequent = ($$anchor) => {
			var span = root$4();
			var text = only_child(span, true);

			template_effect(() => set_text(text, counts()));
			append($$anchor, span);
		};

		if_block(node, ($$render) => {
			if (counts() > 1) $$render(consequent);
		});
	}

	template_effect(() => {
		set_attribute(button, 'data-cites', cites());
		set_attribute(button, 'aria-label', `来源：${label() ?? ''}`);
	});

	append($$anchor, button);
}

var root$3 = from_html(`<p class="muted-line">没有找到相关的原文。</p>`);
var root_1$3 = from_html(`<p class="faint">本段来源</p>`);
var root_2$3 = from_html(`<span class="faint"> </span>`);
var root_3$3 = from_html(`<p class="sheet-text"> </p>`);
var root_4$3 = from_html(`<p class="faint"> </p>`);
var root_5$1 = from_html(`<div class="sheet-entry"><p class="sheet-head"><!> <!> <span> </span></p> <!> <!> <p class="faint"> <!></p> <p class="faint"><button type="button" class="linkish">复制引用格式</button></p></div>`);
var root_6$1 = from_html(`<!> <!>`, 1);
var root_7 = from_html(`<div class="sheet-backdrop" role="presentation"><section class="citation-sheet" role="dialog" aria-modal="false" aria-label="引用来源"><button type="button" class="fav-star sheet-star" aria-label="收藏这条引用">✦</button> <!> <p class="paper-footer"><button type="button" class="linkish"> </button> <button type="button" class="linkish">关闭</button></p></section></div>`);

function CitationSheet($$anchor, $$props) {
	push($$props, true);

	let sheet = state(null);

	// 收藏/历史里的引用只存坐标：打开薄层时按 chunk_id 回捞正文（§12.1）
	user_effect(() => {
		const entries = app.sheet.citations || [];

		for (const entry of entries) {
			if (entry.text || !entry.chunk_id) continue;

			entry.text = '…';

			api.context(entry.chunk_id).then((ctx) => {
				const focus = (ctx.items || []).find((i) => i.is_focus);

				entry.text = focus && focus.text || '';
			}).catch(() => {
				entry.text = '';
			});
		}
	});

	function restoreFocus() {
		const el = document.querySelector('.input-line textarea');

		if (el) el.focus();
	}

	function onKeydown(event) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeOverlays();
			restoreFocus();

			return;
		}

		if (event.key !== 'Tab' || !get(sheet)) return;

		// 焦点圈定：在薄层内循环
		const focusable = get(sheet).querySelectorAll('button, [href], input, [tabindex="0"]');

		if (!focusable.length) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	var div = root_7();
	var section = child(div);
	var button = child(section);
	var node = sibling(button, 2);

	{
		var consequent = ($$anchor) => {
			var p = root$3();

			append($$anchor, p);
		};

		var alternate = ($$anchor) => {
			var fragment = root_6$1();
			var node_1 = first_child(fragment);

			{
				var consequent_1 = ($$anchor) => {
					var p_1 = root_1$3();

					append($$anchor, p_1);
				};

				if_block(node_1, ($$render) => {
					if (app.sheet.citations[0]?.scope === 'paragraph') $$render(consequent_1);
				});
			}

			var node_2 = sibling(node_1, 2);

			each(node_2, 19, () => app.sheet.citations, (entry, i) => entry.chunk_id + '-' + i, ($$anchor, entry, i) => {
				var div_1 = root_5$1();
				var p_2 = child(div_1);
				var node_3 = child(p_2);

				{
					let $0 = user_derived(() => shortSource(get(entry)));
					let $1 = user_derived(() => String(get(entry).n ?? get(i) + 1));

					CitationDot(node_3, {
						get label() {
							return get($0);
						},

						get cites() {
							return get($1);
						}
					});
				}

				var node_4 = sibling(node_3, 2);

				{
					var consequent_2 = ($$anchor) => {
						var span = root_2$3();
						var text = only_child(span);

						template_effect(($0) => set_text(text, `${$0 ?? ''}　`), [() => get(entry).philosophers.join('、')]);
						append($$anchor, span);
					};

					if_block(node_4, ($$render) => {
						if (get(entry).philosophers && get(entry).philosophers.length) $$render(consequent_2);
					});
				}

				var span_1 = sibling(node_4, 2);
				var text_1 = only_child(span_1, true);

				var node_5 = sibling(p_2, 2);

				{
					var consequent_3 = ($$anchor) => {
						var p_3 = root_3$3();
						var text_2 = only_child(p_3, true);

						template_effect(() => set_text(text_2, get(entry).text));
						append($$anchor, p_3);
					};

					if_block(node_5, ($$render) => {
						if (get(entry).text) $$render(consequent_3);
					});
				}

				var node_6 = sibling(node_5, 2);

				{
					var consequent_4 = ($$anchor) => {
						var p_4 = root_4$3();
						var text_3 = only_child(p_4);

						template_effect(() => set_text(text_3, `旧批注（只读）：${get(entry).legacyAnnotation ?? ''}`));
						append($$anchor, p_4);
					};

					if_block(node_6, ($$render) => {
						if (get(entry).legacyAnnotation) $$render(consequent_4);
					});
				}

				var p_5 = sibling(node_6, 2);
				var text_4 = child(p_5);
				var node_7 = sibling(text_4);

				{
					var consequent_5 = ($$anchor) => {
						var text_5 = text();

						template_effect(() => set_text(text_5, `　页 ${get(entry).page ?? ''}`));
						append($$anchor, text_5);
					};

					if_block(node_7, ($$render) => {
						if (get(entry).page) $$render(consequent_5);
					});
				}

				var p_6 = sibling(p_5, 2);
				var button_1 = only_child(p_6);

				template_effect(() => {
					set_text(text_1, get(entry).citation || get(entry).unit_title || '');
					set_text(text_4, `语料库定位：${get(entry).chunk_id ?? ''}　字符 ${get(entry).start ?? ''}–${get(entry).end ?? ''} `);
				});

				delegated('click', button_1, () => navigator.clipboard && navigator.clipboard.writeText(get(entry).citation || get(entry).chunk_id));
				append($$anchor, div_1);
			});

			append($$anchor, fragment);
		};

		if_block(node, ($$render) => {
			if (!app.sheet.citations.length) $$render(consequent); else $$render(alternate, -1);
		});
	}

	var p_7 = sibling(node, 2);
	var button_2 = child(p_7);
	var text_6 = only_child(button_2, true);
	var button_3 = sibling(button_2, 2);
	bind_this(section, ($$value) => set(sheet, $$value), () => get(sheet));
	template_effect(() => set_text(text_6, app.sheet.pinned ? '取消钉住' : '钉住'));

	delegated('click', div, () => {
		closeOverlays();
		restoreFocus();
	});

	delegated('keydown', section, onKeydown);
	delegated('click', section, (e) => e.stopPropagation());

	event('focus', button, () => {
		const c = app.sheet.citations[0];

		if (c) setFocus({ type: 'citation', id: c.chunk_id, label: shortSource(c) });
	});

	delegated('click', button, function (...$$args) {
		favoriteFocused?.apply(this, $$args);
	});

	delegated('click', button_2, function (...$$args) {
		toggleSheetPin?.apply(this, $$args);
	});

	delegated('click', button_3, () => {
		closeOverlays();
		restoreFocus();
	});

	append($$anchor, div);
	pop();
}

delegate(['click', 'keydown']);

enable_legacy_mode_flag();

var $$_import_app = reactive_import(() => app);
var root$2 = from_html(`<button type="button"> </button>`);
var root_1$2 = from_html(`<p class="muted-line">这里还是空的。选中一个问题、回答、引用或概念，按 S 收藏。</p>`);
var root_2$2 = from_html(`<li><button type="button" class="linkish"> </button> <button type="button" class="linkish faint">删除</button></li>`);
var root_3$2 = from_html(`<ul class="starbox-list"></ul>`);
var root_4$2 = from_html(`<section class="starbox" role="dialog" aria-label="星匣"><div class="starbox-tabs"><!> <input class="starbox-search" type="search" placeholder="搜…" aria-label="在星匣里搜索"/> <button type="button" class="linkish">关闭</button></div> <!> <p class="paper-footer"><button type="button" class="linkish">导出 JSON（全部回答）</button> <button type="button" class="linkish">导出 Markdown（收藏）</button></p></section>`);

function StarBox($$anchor, $$props) {
	push($$props, false);

	const TABS = [
		{ key: 'question', label: '问题' },
		{ key: 'answer', label: '回答' },
		{ key: 'citation', label: '引用' },
		{ key: 'concept', label: '概念' }
	];

	async function exportJson() {
		const payload = await exportAllJson();

		download('philo-rag-answers.json', JSON.stringify(payload, null, 2));
	}

	async function exportMarkdown() {
		const text = await exportFavoritesMarkdown();

		download('philo-rag-favorites.md', text, 'text/markdown');
	}

	function search(event) {
		$$_import_app($$_import_app().starbox.query = event.target.value);
		refreshStarbox();
	}

	init();

	var section = root_4$2();
	var div = child(section);
	var node = child(div);

	each(node, 1, () => TABS, (tab) => tab.key, ($$anchor, tab) => {
		var button = root$2();
		let classes;
		var text_1 = only_child(button, true);

		template_effect(() => {
			classes = set_class(button, 1, 'linkish', null, classes, { active: $$_import_app().starbox.tab === get(tab).key });
			set_text(text_1, get(tab).label);
		});

		delegated('click', button, () => setStarboxTab(get(tab).key));
		append($$anchor, button);
	});

	var input = sibling(node, 2);

	var button_1 = sibling(input, 2);

	var node_1 = sibling(div, 2);

	{
		var consequent = ($$anchor) => {
			var p = root_1$2();

			append($$anchor, p);
		};

		var alternate = ($$anchor) => {
			var ul = root_3$2();

			each(ul, 5, () => $$_import_app().starbox.rows, (row) => row.id, ($$anchor, row) => {
				var li = root_2$2();
				var button_2 = child(li);
				var text_2 = only_child(button_2, true);
				var button_3 = sibling(button_2, 2);
				template_effect(() => set_text(text_2, get(row).title || get(row).refId));
				delegated('click', button_2, () => jumpFavorite(get(row)));
				delegated('click', button_3, () => dropFavorite(get(row).id));
				append($$anchor, li);
			});
			append($$anchor, ul);
		};

		if_block(node_1, ($$render) => {
			if (!$$_import_app().starbox.rows.length) $$render(consequent); else $$render(alternate, -1);
		});
	}

	var p_1 = sibling(node_1, 2);
	var button_4 = child(p_1);
	var button_5 = sibling(button_4, 2);
	template_effect(() => set_value(input, $$_import_app().starbox.query));
	delegated('input', input, search);

	delegated('click', button_1, function (...$$args) {
		closeOverlays?.apply(this, $$args);
	});

	delegated('click', button_4, exportJson);
	delegated('click', button_5, exportMarkdown);
	append($$anchor, section);
	pop();
}

delegate(['click', 'input']);

var root$1 = from_html(`<span class="faint"> </span>`);
var root_1$1 = from_html(`<li><button type="button" class="linkish"> </button> <!></li>`);
var root_2$1 = from_html(`<ul class="whisper-results"></ul>`);
var root_3$1 = from_html(`<p class="faint"> </p>`);
var root_4$1 = from_html(`<div class="whisper-backdrop" role="presentation"><div class="whisper" role="dialog" aria-label="低语层"><input class="whisper-input" aria-label="点 / 引 / 脉 / 读 / 图 / 对"/> <!></div></div>`);

function Whisper($$anchor, $$props) {
	push($$props, true);

	let el = state(null);

	user_effect(() => {
		if (app.whisper.open && get(el)) get(el).focus();
	});

	function onInput(event) {
		updateWhisper(event.target.value);
	}

	function onKeydown(event) {
		const results = app.whisper.results;

		if (event.key === 'Escape') {
			event.preventDefault();
			closeWhisper();

			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();

			if (results.length) app.whisper.index = (app.whisper.index + 1) % results.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();

			if (results.length) app.whisper.index = (app.whisper.index - 1 + results.length) % results.length;
		} else if (event.key === 'Enter') {
			if (event.isComposing || event.keyCode === 229) return;

			event.preventDefault();
			runWhisper();
		}
	}

	var div = root_4$1();
	var div_1 = child(div);
	var input = child(div_1);
	bind_this(input, ($$value) => set(el, $$value), () => get(el));

	var node = sibling(input, 2);

	{
		var consequent_1 = ($$anchor) => {
			var ul = root_2$1();

			each(ul, 23, () => app.whisper.results, (row, i) => row.value + i, ($$anchor, row, i) => {
				var li = root_1$1();
				let classes;
				var button = child(li);
				var text = only_child(button, true);
				var node_1 = sibling(button, 2);

				{
					var consequent = ($$anchor) => {
						var span = root$1();
						var text_1 = only_child(span, true);

						template_effect(() => set_text(text_1, get(row).hint));
						append($$anchor, span);
					};

					if_block(node_1, ($$render) => {
						if (get(row).hint) $$render(consequent);
					});
				}

				template_effect(() => {
					classes = set_class(li, 1, '', null, classes, { active: app.whisper.index === get(i) });
					set_text(text, get(row).label);
				});

				delegated('click', button, () => {
					app.whisper.index = get(i);
					runWhisper();
				});

				append($$anchor, li);
			});
			append($$anchor, ul);
		};

		var consequent_2 = ($$anchor) => {
			var p = root_3$1();
			var text_2 = only_child(p);

			template_effect(() => set_text(text_2, `Enter 直接执行「${app.whisper.mode ?? ''}」。`));
			append($$anchor, p);
		};

		var d = user_derived(() => app.whisper.mode !== 'point' && app.whisper.query.trim());

		if_block(node, ($$render) => {
			if (app.whisper.results.length) $$render(consequent_1); else if (get(d)) $$render(consequent_2, 1);
		});
	}
	template_effect(() => set_value(input, app.whisper.raw ?? ''));

	delegated('click', div, function (...$$args) {
		closeWhisper?.apply(this, $$args);
	});

	delegated('click', div_1, (e) => e.stopPropagation());
	delegated('input', input, onInput);
	delegated('keydown', input, onKeydown);
	append($$anchor, div);
	pop();
}

delegate(['click', 'input', 'keydown']);

var root = from_html(`<p class="hint-line">问一个点，或描述一片范围……</p>`);
var root_1 = from_html(`<p class="last-line home-last"> <button type="button" class="linkish">回填</button></p>`);
var root_2 = from_html(`<p class="example-hint">按 / 可以找一个点、一条引文、一个单元。</p>`);
var root_3 = from_html(`<div><p class="example-title">可以这样开始</p> <button type="button" class="example-line">点：康德说的「先验」到底指什么？</button> <button type="button" class="example-line">范围：从笛卡尔到胡塞尔，主体性是如何变化的？</button> <!></div>`);
var root_4 = from_html(`<div class="home"><div aria-hidden="true">○</div> <!> <div class="input-holder"><!></div> <!> <!></div>`);
var root_5 = from_html(`<div class="input-holder bottom"><!></div> <!>`, 1);
var root_6 = from_html(`<main><!></main> <!> <button type="button" class="starbox-trigger" aria-label="打开星匣（F）">✦</button> <!> <!> <!>`, 1);

function App($$anchor, $$props) {
	push($$props, true);

	let inputFocused = state(false);
	let breathing = state(false);
	let exampleLit = state(false);
	let extraHint = state(false);
	let idleTimer = 0;
	const overlayOpen = user_derived(() => app.sheet.open || app.whisper.open || app.starbox.open);

	onMount(async () => {
		await boot();

		// 示例纸片的附加提示只出现一次（跟随示例纸片出现，记在 Dexie meta 里）
		if (!app.exampleClosed) {
			const shown = await db.meta.get('exampleHintShown');

			if (!shown) {
				set(extraHint, true);
				await db.meta.put({ key: 'exampleHintShown', value: 1 });
			}
		}

		armIdle();
		window.addEventListener('pointerdown', armIdle);
		window.addEventListener('keydown', armIdle);
	});

	// 空闲 6 秒：呼吸一次 + 示例纸片微亮一次，不循环
	function armIdle() {
		clearTimeout(idleTimer);

		idleTimer = setTimeout(
			() => {
				if (app.paperKind || get(overlayOpen) || app.input) return;

				set(breathing, true);
				set(exampleLit, true);
				setTimeout(() => set(breathing, false), 2600);
				setTimeout(() => set(exampleLit, false), 2600);
			},
			6000
		);
	}

	function dismissExample() {
		if (app.exampleClosed) return;

		app.exampleClosed = true;
		setFlag(LS.exampleClosed, true);
	}

	function pickExample(text) {
		dismissExample();
		app.input = text;
		focusInput();
	}

	function escape() {
		if (app.sheet.open) return closeOverlays();
		if (app.whisper.open) return closeOverlays();
		if (app.starbox.open) return closeOverlays();

		if (app.exampleClosed === false) {
			dismissExample();

			return;
		}

		if (app.input) {
			app.input = '';

			return;
		}

		resetSession();
	}

	function typingTarget(el) {
		if (!el) return false;

		const tag = el.tagName;

		return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
	}

	function onKeydown(event) {
		if (event.isComposing || event.keyCode === 229) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			escape();

			return;
		}

		if (event.key === '/' && !app.input && !get(overlayOpen) && !typingTarget(event.target)) {
			event.preventDefault();
			openWhisper();

			return;
		}

		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (typingTarget(event.target)) return;

		if (event.key === 's' || event.key === 'S') {
			event.preventDefault();
			favoriteFocused();

			return;
		}

		if (event.key === 'f' || event.key === 'F') {
			event.preventDefault();
			toggleStarbox();

			return;
		}

		if (event.key.length === 1 && !event.shiftKey) {
			if (window.getSelection && String(window.getSelection())) return; // 有选区时不抢输入

			event.preventDefault();
			app.input += event.key;
			focusInput();
			armIdle();
		}
	}

	user_effect(() => {
		// 输入任意字符 → 示例纸片淡出
		if (app.input) dismissExample();
	});

	var fragment = root_6();

	event('keydown', $window, onKeydown);

	var main = first_child(fragment);
	let classes;
	var node = child(main);

	{
		var consequent_4 = ($$anchor) => {
			var div = root_4();
			var div_1 = child(div);
			let classes_1;
			var node_1 = sibling(div_1, 2);

			{
				var consequent = ($$anchor) => {
					var p = root();

					append($$anchor, p);
				};

				if_block(node_1, ($$render) => {
					if (get(inputFocused)) $$render(consequent);
				});
			}

			var div_2 = sibling(node_1, 2);
			var node_2 = child(div_2);

			InputLine(node_2, { onEscapeEmpty: escape });

			var node_3 = sibling(div_2, 2);

			{
				var consequent_1 = ($$anchor) => {
					var p_1 = root_1();
					var text_1 = child(p_1);
					var button = sibling(text_1);
					template_effect(() => set_text(text_1, `上次问到这里：${app.lastQuestion ?? ''} `));

					delegated('click', button, () => {
						app.input = app.lastQuestion;
						focusInput();
					});

					append($$anchor, p_1);
				};

				if_block(node_3, ($$render) => {
					if (app.lastQuestion && !app.input) $$render(consequent_1);
				});
			}

			var node_4 = sibling(node_3, 2);

			{
				var consequent_3 = ($$anchor) => {
					var div_3 = root_3();
					let classes_2;
					var button_1 = sibling(child(div_3), 2);
					var button_2 = sibling(button_1, 2);
					var node_5 = sibling(button_2, 2);

					{
						var consequent_2 = ($$anchor) => {
							var p_2 = root_2();

							append($$anchor, p_2);
						};

						if_block(node_5, ($$render) => {
							if (get(extraHint)) $$render(consequent_2);
						});
					}
					template_effect(() => classes_2 = set_class(div_3, 1, 'example-card', null, classes_2, { lit: get(exampleLit) }));
					delegated('click', button_1, () => pickExample('点：康德说的“先验”到底指什么？'));
					delegated('click', button_2, () => pickExample('范围：从笛卡尔到胡塞尔，主体性是如何变化的？'));
					append($$anchor, div_3);
				};

				if_block(node_4, ($$render) => {
					if (!app.exampleClosed) $$render(consequent_3);
				});
			}
			template_effect(() => classes_1 = set_class(div_1, 1, 'glyph', null, classes_1, { breath: get(breathing) }));
			delegated('focusin', div_2, () => set(inputFocused, true));
			delegated('focusout', div_2, () => set(inputFocused, false));
			append($$anchor, div);
		};

		var alternate = ($$anchor) => {
			var fragment_1 = root_5();
			var div_4 = first_child(fragment_1);
			var node_6 = child(div_4);

			InputLine(node_6, { onEscapeEmpty: escape });

			var node_7 = sibling(div_4, 2);

			Paper(node_7, {});
			delegated('focusin', div_4, () => set(inputFocused, true));
			delegated('focusout', div_4, () => set(inputFocused, false));
			append($$anchor, fragment_1);
		};

		if_block(node, ($$render) => {
			if (!app.paperKind) $$render(consequent_4); else $$render(alternate, -1);
		});
	}

	var node_8 = sibling(main, 2);

	StarField(node_8, {});

	var button_3 = sibling(node_8, 2);
	var node_9 = sibling(button_3, 2);

	{
		var consequent_5 = ($$anchor) => {
			CitationSheet($$anchor, {});
		};

		if_block(node_9, ($$render) => {
			if (app.sheet.open) $$render(consequent_5);
		});
	}

	var node_10 = sibling(node_9, 2);

	{
		var consequent_6 = ($$anchor) => {
			StarBox($$anchor, {});
		};

		if_block(node_10, ($$render) => {
			if (app.starbox.open) $$render(consequent_6);
		});
	}

	var node_11 = sibling(node_10, 2);

	{
		var consequent_7 = ($$anchor) => {
			Whisper($$anchor, {});
		};

		if_block(node_11, ($$render) => {
			if (app.whisper.open) $$render(consequent_7);
		});
	}

	template_effect(() => classes = set_class(main, 1, 'stage', null, classes, { 'has-paper': !!app.paperKind }));
	delegated('click', button_3, () => toggleStarbox(true));
	append($$anchor, fragment);
	pop();
}

delegate(['focusin', 'focusout', 'click']);

mount(App, { target: document.getElementById('app') });
