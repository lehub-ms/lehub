#!/usr/bin/env bash
# Workspace resolution for the LeHub local stack. Sourced by lib/common.sh, never executed.
#
# A workspace is one working tree — the main clone or any `git worktree`. Each gets a slug,
# a stable numeric slot, and its own database on the single shared SQL Server instance.
#
# Isolating the database rather than the engine is deliberate: the useful isolation between
# branches is the schema and the data, which a separate database provides in full, whereas a
# SQL Server container per worktree would cost about 2 GB of RAM each. A container per
# workspace stays the documented fallback for the one case a database does not cover —
# testing an engine version change.

# ─── Shared state ────────────────────────────────────────────────────────────
# The Git common directory is the one place every working tree of a clone shares by
# construction. Putting the cross-workspace state there keeps it out of every working tree,
# so it can never be committed, without inventing machine-level state under $HOME.

# The shared SQL data volume, as Compose names it: project `lehub` + volume `lehub-sql-data`.
INSTANCE_SQL_VOLUME='lehub_lehub-sql-data'

# Slots 0..3. Each slot will add two redirect URIs to declare on the Entra External ID
# application once local authentication lands (Epic #2), which is what caps the count.
LEHUB_MAX_SLOTS=4

workspace_state_dir() {
  if [[ -z "${LEHUB_STATE_DIR:-}" ]]; then
    local common
    common="$(git -C "$ROOT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
      || die "$ROOT_DIR is not a Git working tree — the shared workspace state lives in the Git common directory."
    LEHUB_STATE_DIR="${common%/}/lehub-dev"
    mkdir -p "$LEHUB_STATE_DIR"
    chmod 700 "$LEHUB_STATE_DIR"
  fi
  printf '%s' "$LEHUB_STATE_DIR"
}

# ─── Registry lock ───────────────────────────────────────────────────────────
# mkdir is atomic on every filesystem this repository cares about, and macOS ships no flock.
# Two `dev-up.sh` started at the same second in two worktrees must not read the same free
# slot and both claim it.

_LEHUB_LOCK_DIR=''

workspace_lock() {
  local dir
  dir="$(workspace_state_dir)/.lock"

  for _ in $(seq 1 100); do
    if mkdir "$dir" 2>/dev/null; then
      _LEHUB_LOCK_DIR="$dir"
      # Released on every exit path, including `die`. Callers install their own traps only
      # after workspace_resolve has returned, so nothing of theirs is clobbered here.
      trap 'workspace_unlock' EXIT INT TERM
      return 0
    fi
    # A lock older than a minute belongs to a script that died without releasing it.
    if [[ -n "$(find "$dir" -maxdepth 0 -mmin +1 2>/dev/null)" ]]; then
      rmdir "$dir" 2>/dev/null || true
    fi
    sleep 0.1
  done

  die "Could not acquire the workspace registry lock at $dir after 10s.
  Another LeHub script is holding it, or it was left behind: remove the directory and retry."
}

workspace_unlock() {
  if [[ -n "$_LEHUB_LOCK_DIR" ]]; then
    rmdir "$_LEHUB_LOCK_DIR" 2>/dev/null || true
    _LEHUB_LOCK_DIR=''
    trap - EXIT INT TERM
  fi
  return 0
}

# ─── Slug ────────────────────────────────────────────────────────────────────
# Derived from the working tree's directory name, normalised to what a SQL Server database
# name and a shell variable both tolerate.

_sha256_of_string() {
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  else
    printf '%s' "$1" | sha256sum | awk '{print $1}'
  fi
}

workspace_slug() {
  local slug
  slug="$(basename "$ROOT_DIR")"
  slug="$(printf '%s' "$slug" | LC_ALL=C tr '[:upper:]' '[:lower:]' \
    | LC_ALL=C sed -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-*//' -e 's/-*$//')"
  slug="${slug:0:32}"
  slug="${slug%%-}"
  [[ -n "$slug" ]] || slug='workspace'
  printf '%s' "$slug"
}

# ─── Resolution ──────────────────────────────────────────────────────────────
# Sets LEHUB_SLOT, LEHUB_SLUG and LEHUB_DB_NAME once per process. The slot comes from the
# registry, never from probing ports: a workspace that is merely stopped keeps its slot.

workspace_resolve() {
  [[ -n "${LEHUB_SLOT:-}" ]] && return 0

  local state registry git_dir common_dir is_main slug slot entry
  state="$(workspace_state_dir)"
  registry="$state/workspaces"

  # In the main working tree these two are the same directory; in a linked worktree the
  # first points into `.git/worktrees/<name>`. That is an exact test, independent of where
  # the worktree happens to live on disk.
  git_dir="$(git -C "$ROOT_DIR" rev-parse --path-format=absolute --git-dir)"
  common_dir="$(git -C "$ROOT_DIR" rev-parse --path-format=absolute --git-common-dir)"
  [[ "${git_dir%/}" == "${common_dir%/}" ]] && is_main=true || is_main=false

  workspace_lock
  [[ -f "$registry" ]] || : > "$registry"

  # Purge entries whose working tree is gone — `git worktree remove`, or a plain rm -rf.
  local kept=() r_slot r_slug r_path
  while IFS=$'\t' read -r r_slot r_slug r_path; do
    [[ -n "${r_path:-}" && -d "$r_path" ]] || continue
    kept+=("$r_slot"$'\t'"$r_slug"$'\t'"$r_path")
  done < "$registry"

  # An entry for this exact path wins: slot and slug are stable from one run to the next.
  slot=''; slug=''
  for entry in ${kept[@]+"${kept[@]}"}; do
    IFS=$'\t' read -r r_slot r_slug r_path <<< "$entry"
    [[ "$r_path" == "$ROOT_DIR" ]] || continue
    slot="$r_slot"; slug="$r_slug"
  done

  if [[ -z "$slot" ]]; then
    slug="$(workspace_slug)"

    # Two worktrees named alike under different parents would otherwise share a database.
    for entry in ${kept[@]+"${kept[@]}"}; do
      IFS=$'\t' read -r r_slot r_slug r_path <<< "$entry"
      if [[ "$r_slug" == "$slug" && "$r_path" != "$ROOT_DIR" ]]; then
        slug="${slug:0:25}-$(_sha256_of_string "$ROOT_DIR" | cut -c1-6)"
        break
      fi
    done

    if [[ "$is_main" == true ]]; then
      # Slot 0 belongs to the main clone by construction, not by arrival order: that is what
      # keeps its ports and its database exactly what they were before workspaces existed.
      slot=0
    else
      local used=' ' candidate
      for entry in ${kept[@]+"${kept[@]}"}; do
        used+="${entry%%$'\t'*} "
      done
      for candidate in $(seq 1 $((LEHUB_MAX_SLOTS - 1))); do
        [[ "$used" == *" $candidate "* ]] && continue
        slot="$candidate"; break
      done
      [[ -n "$slot" ]] || die "All $LEHUB_MAX_SLOTS workspace slots are taken.
  Slot 0 is reserved for the main clone; slots 1-$((LEHUB_MAX_SLOTS - 1)) are in use:
$(sed 's/\t/  /g; s/^/    /' "$registry")
  Free one with ./scripts/dev-down.sh --drop-db then git worktree remove, and retry."
    fi

    kept+=("$slot"$'\t'"$slug"$'\t'"$ROOT_DIR")
  fi

  : > "$registry"
  for entry in ${kept[@]+"${kept[@]}"}; do
    printf '%s\n' "$entry" >> "$registry"
  done

  workspace_unlock

  LEHUB_SLOT="$slot"
  LEHUB_SLUG="$slug"
  # Slot 0 keeps `lehub-local`, the name every existing document and habit refers to.
  if [[ "$slot" -eq 0 ]]; then
    LEHUB_DB_NAME='lehub-local'
  else
    LEHUB_DB_NAME="lehub-$slug"
  fi

  # One hundred per slot, so slot 0 keeps exactly the ports the main clone always had and
  # the numbers stay readable: 7071/5173/5174, then 7171/5273/5274, and so on.
  LEHUB_API_PORT=$((7071 + slot * 100))
  LEHUB_WEB_PORT=$((5173 + slot * 100))
  LEHUB_ADMIN_PORT=$((5174 + slot * 100))
  # `func start` opens no inspector of its own — only the HTTP port above and a random
  # loopback channel to its language worker — so nothing needs this to avoid a clash. It is
  # published so `func start --inspect $LEHUB_INSPECT_PORT` is collision-free when a
  # contributor does attach a debugger in two workspaces at once.
  LEHUB_INSPECT_PORT=$((9229 + slot * 100))

  # Consumed by port_listeners/stop_dev_processes in lib/common.sh: every port check and
  # every kill is scoped to this workspace, so dev-down.sh here cannot reach another one.
  # shellcheck disable=SC2034  # read by lib/common.sh, dev-start.sh and dev-down.sh
  DEV_PORTS=("$LEHUB_API_PORT" "$LEHUB_WEB_PORT" "$LEHUB_ADMIN_PORT")

  export LEHUB_SLOT LEHUB_SLUG LEHUB_DB_NAME
  export LEHUB_API_PORT LEHUB_WEB_PORT LEHUB_ADMIN_PORT LEHUB_INSPECT_PORT
}

# Who is holding a port. A contributor needs to know whether to switch worktrees or to go
# hunt an unrelated process, and the port number alone does not say.
workspace_describe_port_holder() {
  local pid cwd registry r_slot r_slug r_path
  pid="$(port_listeners "$1" | head -1)"
  [[ -n "$pid" ]] || return 1

  # A Vite process runs from the front-end directory, not from the working tree root, so the
  # registry is matched on a prefix rather than on equality.
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  registry="$(workspace_state_dir)/workspaces"

  if [[ -n "$cwd" && -f "$registry" ]]; then
    while IFS=$'\t' read -r r_slot r_slug r_path; do
      [[ -n "${r_path:-}" ]] || continue
      if [[ "$cwd" == "$r_path" || "$cwd" == "$r_path"/* ]]; then
        printf 'the LeHub workspace at slot %s, %s (pid %s).\n' "$r_slot" "$r_path" "$pid"
        printf '  Run ./scripts/dev-down.sh there — from here it would not reach that workspace.'
        return 0
      fi
    done < "$registry"
  fi

  printf 'a process unrelated to LeHub (pid %s%s).\n' "$pid" "${cwd:+, cwd $cwd}"
  printf '  Identify it with: lsof -i:%s -sTCP:LISTEN' "$1"
}

# ─── SQL Server instance password ────────────────────────────────────────────
# The SA password is a property of the instance, not of a workspace: SQL Server applies
# MSSQL_SA_PASSWORD only when it initialises an empty data directory. Generating one per
# workspace against a shared volume is what left the container stuck unhealthy on
# "Login failed for user 'sa'" as soon as a second worktree was bootstrapped.

workspace_sa_password() {
  local state file
  state="$(workspace_state_dir)"
  file="$state/sa-password"

  if [[ -s "$file" ]]; then
    cat "$file"
    return 0
  fi

  # Adopt the password of a working tree bootstrapped before this shared state existed: the
  # volume was initialised with it, and no other password will ever log in. Every working
  # tree is scanned, not just this one — the clone that holds it is usually another.
  local tree adopted
  while read -r tree; do
    [[ -f "$tree/.env" ]] || continue
    adopted="$(sed -n 's/^MSSQL_SA_PASSWORD=//p' "$tree/.env" | head -1)"
    if [[ -n "$adopted" ]]; then
      printf '%s' "$adopted" > "$file"
      chmod 600 "$file"
      printf '%s' "$adopted"
      return 0
    fi
  done < <(git -C "$ROOT_DIR" worktree list --porcelain | sed -n 's/^worktree //p')

  if docker volume inspect "$INSTANCE_SQL_VOLUME" >/dev/null 2>&1; then
    die "The shared SQL volume $INSTANCE_SQL_VOLUME exists, but its password is gone:
  $file was deleted and no workspace .env holds it any more.
  SQL Server only applies a password when it initialises an empty data directory, so no
  new password can ever authenticate against this volume.
  Start from an empty database: ./scripts/dev-down.sh --volumes, then rerun this script."
  fi

  # Generated rather than templated: a working password committed to the repository would
  # be the real one on every default workspace. The suffix guarantees SQL Server's
  # complexity requirement whatever rand produces.
  local generated
  generated="$(LC_ALL=C openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)aA1!"
  printf '%s' "$generated" > "$file"
  chmod 600 "$file"
  printf '%s' "$generated"
}

# .env and api/local.settings.json are rendered from the workspace and the shared store on
# every run, not merely created when absent. "Left untouched" is exactly what let a
# workspace keep a password the shared volume had never been initialised with, and what
# would let a reassigned slot inherit the previous occupant's database.

# ─── Network exposure ────────────────────────────────────────────────────────
# The address of this machine on the local network, so a phone or a tablet can reach the
# stack. Taken from the default route rather than from the first non-loopback address: with
# a VPN up the default route is the VPN's, which is the honest answer to "where would a
# packet leaving this machine go", and --network=<ip> overrides it when it is not what you
# want.
workspace_network_host() {
  local host='' iface candidates

  case "$OSTYPE" in
    darwin*)
      iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
      [[ -n "$iface" ]] && host="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      ;;
    *)
      host="$(ip -4 route get 1.1.1.1 2>/dev/null \
        | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
      ;;
  esac

  if [[ -z "$host" ]]; then
    candidates="$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | grep -v '^127\.' | tr '\n' ' ')"
    die "Could not work out this machine's address on the local network.
  ${candidates:+Addresses found: $candidates}
  Pass the one your phone can reach: ./scripts/dev-start.sh --network=<ip>"
  fi

  printf '%s' "$host"
}

# ─── Derived environment files ───────────────────────────────────────────────

# workspace_render_env [<public-host>]
#
# Without an argument every URL stays on the loopback, which is the default and the only
# behaviour there was. With one — the machine's address on the local network — the three
# values that have to follow it do: the API's CORS allow-list, the API origin the two
# applications call, and the media base URL, because an image served on the loopback is
# unreachable from the phone.
#
# Rendering on every start rather than at bootstrap is what makes the widening temporary:
# there is nothing to restore on exit, a Ctrl-C that kills the shell leaves no widened
# allow-list behind, and the next start without --network puts everything back.
workspace_render_env() {
  workspace_resolve
  need_cmd node "Install Node — see docs/local-dev.md"

  local public_host="${1:-localhost}"
  local password rendered
  password="$(workspace_sa_password)"

  # umask in a subshell rather than a chmod afterwards: the file holds the SQL password, and
  # between a default-mode create and the chmod it would be world-readable.
  ( umask 077
    cat > "$ROOT_DIR/.env" <<EOF
# Generated by ./scripts/dev-up.sh and ./scripts/dev-start.sh — every run rewrites it.
# See .env.example for what these values are, and docs/local-dev.md for the workspace model.

LEHUB_SLOT=$LEHUB_SLOT
LEHUB_SLUG=$LEHUB_SLUG
LEHUB_DB=$LEHUB_DB_NAME

LEHUB_API_PORT=$LEHUB_API_PORT
LEHUB_WEB_PORT=$LEHUB_WEB_PORT
LEHUB_ADMIN_PORT=$LEHUB_ADMIN_PORT
LEHUB_INSPECT_PORT=$LEHUB_INSPECT_PORT

# A property of the shared SQL Server instance, not of this workspace: the single copy lives
# in the Git common directory and is never regenerated.
MSSQL_SA_PASSWORD=$password
EOF
  )
  chmod 600 "$ROOT_DIR/.env"

  # Both origins of this slot. The calls stay cross-origin — no Vite proxy is introduced —
  # so an origin the API does not list is simply refused, which is the production path.
  local api_origin="http://localhost:$LEHUB_API_PORT"
  local cors="http://localhost:$LEHUB_WEB_PORT,http://localhost:$LEHUB_ADMIN_PORT"
  local media_base_url="$AZURITE_BLOB_ENDPOINT/$MEDIA_CONTAINER"
  local dev_host='localhost'

  if [[ "$public_host" != 'localhost' ]]; then
    # Bind every interface rather than the address itself: binding the network interface
    # alone would take localhost away, and Vite's HMR client follows location.hostname, so
    # both paths keep working.
    dev_host='0.0.0.0'
    api_origin="http://$public_host:$LEHUB_API_PORT"
    # Azurite already publishes on every interface; only the URL handed to the browser was
    # wrong, which is why an image failed to load on the phone while the page rendered.
    media_base_url="http://$public_host:$AZURITE_BLOB_PORT/devstoreaccount1/$MEDIA_CONTAINER"
    # The loopback origins stay allowed: the desktop browser has to keep working while the
    # phone is being tested. Still this slot's origins only, and only while --network is
    # passed.
    cors="$cors,http://$public_host:$LEHUB_WEB_PORT,http://$public_host:$LEHUB_ADMIN_PORT"
  fi

  rendered="$(LEHUB_DB_NAME="$LEHUB_DB_NAME" MSSQL_SA_PASSWORD="$password" \
    LEHUB_CORS_ORIGINS="$cors" LEHUB_MEDIA_BASE_URL="$media_base_url" \
    node "$LIB_DIR/local-settings.mjs" \
      "$ROOT_DIR/api/local.settings.json" "$ROOT_DIR/api/local.settings.json.example")"

  _workspace_render_frontend_env frontend/lehub.ms "$api_origin" "$LEHUB_WEB_PORT" "$dev_host"
  _workspace_render_frontend_env frontend/admin.lehub.ms "$api_origin" "$LEHUB_ADMIN_PORT" "$dev_host"

  case "$rendered" in
    created) ok "Created api/local.settings.json" ;;
    '')      dim "api/local.settings.json already up to date" ;;
    *)       ok "Updated api/local.settings.json ($rendered)" ;;
  esac
}

# Rewritten rather than copied from the template on first run: a .env.local written before
# workspaces existed still points at the API in hard-coded form, and a slot freed then
# reassigned must never let its new occupant inherit the previous one's origin.
#
# .env.test is deliberately untouched — it is a committed fixture that depends on no server.
_workspace_render_frontend_env() {
  local app="$1" api_origin="$2" port="$3" dev_host="$4"
  cat > "$ROOT_DIR/$app/.env.local" <<EOF
# Generated by ./scripts/dev-up.sh and ./scripts/dev-start.sh — every run rewrites it.
# Vite inlines VITE_* values at build time, so these are public: never put a secret here.

VITE_API_BASE_URL=$api_origin
VITE_DEV_PORT=$port
VITE_DEV_HOST=$dev_host
EOF
}
