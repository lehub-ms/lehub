import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { buildEntraConfig, describeEntraConfigError, type EntraConfig } from './entraConfig'
import { errorResponse } from './httpErrors'

/**
 * A relay in front of the tenant's Native Authentication endpoints.
 *
 * The endpoints emit no CORS headers — Microsoft's own guidance is that a single-page app
 * must put a proxy between itself and them — so every step of sign-up, sign-in and password
 * reset travels through here. Both front-ends already call this API cross-origin in every
 * environment, so nothing new is exercised by doing so.
 *
 * It is a pass-through, and the boundary is worth stating because it is easy to erode:
 * no business rule, no password check, no decision about what the next step is. It adds the
 * client ID, the challenge types and the scope — three values a caller must not be able to
 * choose — transposes the JSON body to the form encoding Entra expects, and returns a
 * response carrying `error` and `suberror` exactly as received. Turning those into a French
 * sentence is the SPA's job (#98) and deliberately not this file's.
 *
 * One route per flow, dispatching on a `step` in the body rather than multiplying routes,
 * so the step table below is the whole protocol in one readable place.
 */
export type AuthFlow = 'signup' | 'signin' | 'reset' | 'token'

/**
 * The only body fields a caller may set. A field outside this list is not forwarded — the
 * relay never builds an outgoing request from whatever it was handed.
 */
const CALLER_FIELDS = [
  'username',
  'password',
  'oob',
  'new_password',
  'continuation_token',
  'refresh_token',
] as const

type CallerField = (typeof CALLER_FIELDS)[number]

interface StepSpec {
  /** Path under the tenant's Native Authentication base. */
  readonly path: string
  readonly required: readonly CallerField[]
  readonly optional?: readonly CallerField[]
  /** Whether the step accepts the `attributes` object, forwarded as a JSON string. */
  readonly acceptsAttributes?: true
  /** Added by the relay. Always contains `redirect`, which Entra requires. */
  readonly challengeType?: string
  /** A fixed value the relay sets, or the allowlist the caller picks from. */
  readonly grantType?: string | readonly string[]
  /** Whether the step asks for tokens, and so must carry the scope. */
  readonly withScope?: true
}

// `redirect` is mandatory in every challenge_type list: it is how a client says it can fall
// back to the browser flow, and Entra rejects a list without it.
const CHALLENGE_PASSWORD = 'password oob redirect'
const CHALLENGE_OOB = 'oob redirect'

/**
 * Fixed here rather than taken from the caller. A relay that forwarded a client-chosen scope
 * would let any origin that reaches it mint tokens for a resource of its choosing; the API
 * only ever wants tokens for itself. `offline_access` is what makes a refresh token come back,
 * which is what the session of #96 rests on.
 */
const SCOPE = 'openid profile email offline_access api://lehub-api/access_as_user'

const FLOWS: Record<AuthFlow, Readonly<Record<string, StepSpec>>> = {
  signup: {
    start: {
      path: '/signup/v1.0/start',
      required: ['username'],
      acceptsAttributes: true,
      challengeType: CHALLENGE_PASSWORD,
    },
    challenge: {
      path: '/signup/v1.0/challenge',
      required: ['continuation_token'],
      challengeType: CHALLENGE_PASSWORD,
    },
    continue: {
      path: '/signup/v1.0/continue',
      required: ['continuation_token'],
      optional: ['oob', 'password'],
      acceptsAttributes: true,
      grantType: ['oob', 'password', 'attributes'],
    },
    // Sign-up ends by exchanging its last continuation token for tokens, which is what makes
    // the account usable without a second trip through sign-in.
    token: {
      path: '/oauth2/v2.0/token',
      required: ['continuation_token'],
      grantType: 'continuation_token',
      withScope: true,
    },
  },

  signin: {
    start: {
      path: '/oauth2/v2.0/initiate',
      required: ['username'],
      challengeType: CHALLENGE_PASSWORD,
    },
    challenge: {
      path: '/oauth2/v2.0/challenge',
      required: ['continuation_token'],
      challengeType: CHALLENGE_PASSWORD,
    },
    token: {
      path: '/oauth2/v2.0/token',
      required: ['continuation_token'],
      optional: ['password', 'oob'],
      grantType: ['password', 'oob', 'continuation_token'],
      withScope: true,
    },
  },

  reset: {
    start: {
      path: '/resetpassword/v1.0/start',
      required: ['username'],
      challengeType: CHALLENGE_OOB,
    },
    challenge: {
      path: '/resetpassword/v1.0/challenge',
      required: ['continuation_token'],
      challengeType: CHALLENGE_OOB,
    },
    continue: {
      path: '/resetpassword/v1.0/continue',
      required: ['continuation_token', 'oob'],
      grantType: 'oob',
    },
    submit: {
      path: '/resetpassword/v1.0/submit',
      required: ['continuation_token', 'new_password'],
    },
    // The tenant applies the new password asynchronously; `submit` answers with the interval
    // to wait between polls. Without this step a client would conclude failure from a reset
    // that simply had not finished.
    poll: {
      path: '/resetpassword/v1.0/poll_completion',
      required: ['continuation_token'],
    },
    token: {
      path: '/oauth2/v2.0/token',
      required: ['continuation_token'],
      grantType: 'continuation_token',
      withScope: true,
    },
  },

  token: {
    refresh: {
      path: '/oauth2/v2.0/token',
      required: ['refresh_token'],
      grantType: 'refresh_token',
      withScope: true,
    },
  },
}

/**
 * Everything the relay copies out of Entra's response, and nothing else.
 *
 * An allowlist rather than a passthrough: `error_description` carries the raw English label
 * and an AADSTS code, `trace_id` and `correlation_id` carry tenant diagnostics. All three are
 * useful in a log and none of them belong in a browser, so they are read for logging below
 * and dropped from the body.
 */
const RESPONSE_FIELDS = [
  'continuation_token',
  'challenge_type',
  'challenge_target_label',
  'challenge_channel',
  'code_length',
  'binding_method',
  'interval',
  'poll_interval',
  'status',
  'required_attributes',
  'invalid_attributes',
  'access_token',
  'refresh_token',
  'id_token',
  'token_type',
  'expires_in',
  'error',
  'suberror',
] as const

/** A response with none of these and no `error` told us nothing usable. */
const PROGRESS_FIELDS = ['continuation_token', 'access_token', 'status'] as const

const UPSTREAM_TIMEOUT_MS = 10_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A caller field is only forwarded when it is a non-empty string. */
function readField(body: Record<string, unknown>, name: string): string | null {
  const value = body[name]
  if (typeof value !== 'string') return null
  const trimmed = name === 'password' || name === 'new_password' ? value : value.trim()
  return trimmed === '' ? null : trimmed
}

export function buildStepForm(
  spec: StepSpec,
  body: Record<string, unknown>,
  config: EntraConfig,
): { ok: true; form: URLSearchParams } | { ok: false; code: string; message: string } {
  const form = new URLSearchParams()
  form.set('client_id', config.clientId)

  if (spec.challengeType) form.set('challenge_type', spec.challengeType)
  if (spec.withScope) form.set('scope', SCOPE)

  if (typeof spec.grantType === 'string') {
    form.set('grant_type', spec.grantType)
  } else if (spec.grantType) {
    const requested = readField(body, 'grant_type')
    if (requested === null || !spec.grantType.includes(requested)) {
      return {
        ok: false,
        code: 'UNSUPPORTED_GRANT_TYPE',
        message: `grant_type must be one of: ${spec.grantType.join(', ')}.`,
      }
    }
    form.set('grant_type', requested)
  }

  for (const name of spec.required) {
    const value = readField(body, name)
    if (value === null) {
      return { ok: false, code: 'MISSING_FIELD', message: `${name} is required for this step.` }
    }
    form.set(name, value)
  }

  for (const name of spec.optional ?? []) {
    const value = readField(body, name)
    if (value !== null) form.set(name, value)
  }

  if (spec.acceptsAttributes && body['attributes'] !== undefined) {
    const attributes = body['attributes']
    if (!isRecord(attributes)) {
      return { ok: false, code: 'INVALID_ATTRIBUTES', message: 'attributes must be an object.' }
    }
    // Entra wants a JSON *string* here, and ignores keys that do not match a configured user
    // attribute. Which keys those are is a property of the user flow, not of the relay, so the
    // object is stringified as given and never renamed.
    form.set('attributes', JSON.stringify(attributes))
  }

  return { ok: true, form }
}

/** Keeps only the contract fields, dropping anything else the tenant sent. */
export function projectResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const projected: Record<string, unknown> = {}
  for (const name of RESPONSE_FIELDS) {
    if (payload[name] !== undefined) projected[name] = payload[name]
  }
  return projected
}

export function hasProgress(payload: Record<string, unknown>): boolean {
  return PROGRESS_FIELDS.some((name) => payload[name] !== undefined)
}

export function lookupStep(flow: AuthFlow, step: unknown): StepSpec | null {
  if (typeof step !== 'string') return null
  const steps = FLOWS[flow]
  return Object.hasOwn(steps, step) ? (steps[step] as StepSpec) : null
}

/** The step names a flow accepts, so a rejection can name them. */
export function stepNames(flow: AuthFlow): string[] {
  return Object.keys(FLOWS[flow])
}

/**
 * The whole handler, shared by the four route files.
 *
 * Nothing from the request body is ever logged: it carries passwords, one-time codes and
 * continuation tokens, and a log line is exactly where none of them may end up.
 */
export async function relayNativeAuth(
  flow: AuthFlow,
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const configResult = buildEntraConfig()
  if (!configResult.ok) {
    // Actionable in the logs, opaque to the caller: the message names the missing setting.
    context.error(`Native auth relay unusable: ${describeEntraConfigError(configResult.error)}`)
    return errorResponse(500, 'ENTRA_NOT_CONFIGURED', 'The identity provider is not configured.')
  }
  const config = configResult.config

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'INVALID_REQUEST_BODY', 'A JSON object body is required.')
  }
  if (!isRecord(body)) {
    return errorResponse(400, 'INVALID_REQUEST_BODY', 'A JSON object body is required.')
  }

  const step = body['step']
  const spec = lookupStep(flow, step)
  if (!spec) {
    // Refused before anything leaves the process: an unknown step must never become an
    // outgoing request assembled from guesswork.
    return errorResponse(400, 'UNKNOWN_STEP', `step must be one of: ${stepNames(flow).join(', ')}.`)
  }

  const built = buildStepForm(spec, body, config)
  if (!built.ok) return errorResponse(400, built.code, built.message)

  const url = `${config.nativeAuthBaseUrl}${spec.path}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: built.form,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (error) {
    // Typed apart from a functional refusal on purpose: an outage must not reach the user as
    // "incorrect email or password".
    context.error(`Native auth ${flow}/${String(step)} could not reach the tenant`, error)
    return errorResponse(502, 'IDENTITY_PROVIDER_UNAVAILABLE', 'The identity provider is unreachable.')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    context.error(`Native auth ${flow}/${String(step)} returned a non-JSON body`, {
      status: response.status,
    })
    return errorResponse(502, 'IDENTITY_PROVIDER_UNEXPECTED_RESPONSE', 'The identity provider returned an unreadable response.')
  }
  if (!isRecord(payload)) {
    context.error(`Native auth ${flow}/${String(step)} returned a non-object body`, {
      status: response.status,
    })
    return errorResponse(502, 'IDENTITY_PROVIDER_UNEXPECTED_RESPONSE', 'The identity provider returned an unreadable response.')
  }

  const projected = projectResponse(payload)

  if (payload['error'] !== undefined && payload['error'] !== null) {
    // A refusal by the tenant, forwarded as such. The raw label and the trace identifiers are
    // logged here and stop here; the SPA gets the codes and writes the French sentence.
    context.error(`Native auth ${flow}/${String(step)} refused`, {
      status: response.status,
      error: payload['error'],
      suberror: payload['suberror'],
      error_description: payload['error_description'],
      trace_id: payload['trace_id'],
      correlation_id: payload['correlation_id'],
    })
    return { status: response.status >= 400 ? response.status : 400, jsonBody: projected }
  }

  if (!response.ok || !hasProgress(payload)) {
    // No error and nothing to continue with is a failure, not a quiet success.
    context.error(`Native auth ${flow}/${String(step)} answered without error and without progress`, {
      status: response.status,
    })
    return errorResponse(502, 'IDENTITY_PROVIDER_UNEXPECTED_RESPONSE', 'The identity provider returned an unusable response.')
  }

  return { status: 200, jsonBody: projected }
}
