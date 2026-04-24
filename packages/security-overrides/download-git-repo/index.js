const { spawn } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

module.exports = function download(repo, dest, opts, callback) {
  if (typeof opts === "function") {
    callback = opts
    opts = {}
  }
  opts = opts || {}

  const parsed = normalizeRepo(repo)
  const url = parsed.url || getGitUrl(parsed)
  const checkout = parsed.checkout
  const args = ["clone"]

  if (opts.shallow !== false) args.push("--depth", "1")
  args.push("--", url, dest)

  runGit(args, undefined, (cloneError) => {
    if (cloneError) return callback(cloneError)

    const finish = () => {
      fs.rm(path.join(dest, ".git"), { recursive: true, force: true }, callback)
    }

    if (!checkout || checkout === "master" || checkout === "main") {
      finish()
      return
    }

    runGit(["checkout", checkout], dest, (checkoutError) => {
      if (checkoutError) return callback(checkoutError)
      finish()
    })
  })
}

function runGit(args, cwd, callback) {
  const child = spawn("git", args, { cwd, stdio: "ignore" })
  child.on("error", callback)
  child.on("close", (code) => {
    if (code === 0) callback()
    else callback(new Error(`git ${args[0]} failed with status ${code}`))
  })
}

function normalizeRepo(repo) {
  const direct = /^(direct):([^#]+)(?:#(.+))?$/.exec(repo)
  if (direct) {
    return { type: "direct", url: direct[2], checkout: direct[3] || "master" }
  }

  const match = /^(?:(github|gitlab|bitbucket):)?(?:(.+):)?([^/]+)\/([^#]+)(?:#(.+))?$/.exec(repo)
  if (!match) throw new Error(`Invalid repository: ${repo}`)

  const type = match[1] || "github"
  const origin = match[2] || defaultOrigin(type)

  return {
    type,
    origin,
    owner: match[3],
    name: match[4],
    checkout: match[5] || "master",
  }
}

function defaultOrigin(type) {
  if (type === "gitlab") return "gitlab.com"
  if (type === "bitbucket") return "bitbucket.org"
  return "github.com"
}

function getGitUrl(repo) {
  const origin = repo.origin.startsWith("http") ? repo.origin : `https://${repo.origin}`
  return `${origin}/${repo.owner}/${repo.name}.git`
}
