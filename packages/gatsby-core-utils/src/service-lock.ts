/*
 * Service lock: handles service discovery for Gatsby develop processes
 * The problem:  the develop process starts a proxy server, the actual develop process and a websocket server for communication. The two latter ones have random ports that need to be discovered. We also cannot run multiple of the same site at the same time.
 * The solution: lockfiles! We create a lockfolder in `.config/gatsby/sites/${sitePathHash} and then write a file to that lockfolder for every service with its port.
 *
 * NOTE(@mxstbr): This is NOT EXPORTED from the main index.ts due to this relying on Node.js-specific APIs but core-utils also being used in browser environments. See https://github.com/jprichardson/node-fs-extra/issues/743
 */
import path from "path"
import os from "os"
import lockfile from "proper-lockfile"
import fs from "fs-extra"
import { createContentDigest } from "./create-content-digest"

const globalConfigPath =
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), `.config`)

const getLockfileDir = (programPath: string): string => {
  const hash = createContentDigest(programPath)

  return path.join(globalConfigPath, `gatsby`, `sites`, `${hash}`)
}

export const createServiceLock = async (
  programPath: string,
  name: string,
  content: string
): Promise<boolean> => {
  console.log("CREATE SERVICE LOCK", name)
  const lockfileDir = path.join(getLockfileDir(programPath), `${name}.lock`)

  console.log("CREATE SERVICE LOCK DIR", lockfileDir)
  await fs.ensureDir(lockfileDir)

  try {
    await lockfile.lock(lockfileDir)
  } catch (err) {
    return false
  }

  console.log("WRITE SERVICE LOCK FILE", path.join(lockfileDir, `data`))
  // Once the directory for this site is locked, we write a file to the dir with the service metadata
  await fs.writeFile(path.join(lockfileDir, `data`), content)

  return true
}

export const getService = (
  programPath: string,
  name: string
): Promise<string | null> => {
  const lockfileDir = getLockfileDir(programPath)
  const datafilePath = path.join(lockfileDir, `${name}.lock`, `data`)

  try {
    return fs.readFile(datafilePath, `utf8`).catch(() => null)
  } catch (err) {
    return Promise.resolve(null)
  }
}

export const getServices = async (programPath: string): Promise<any> => {
  const lockfileDir = getLockfileDir(programPath)

  const files = await fs.readdir(lockfileDir)
  const services = {}

  await Promise.all(
    files
      .filter(file => file.endsWith(`.lock`))
      .map(async file => {
        const service = file.replace(`.lock`, ``)
        services[service] = await getService(programPath, service)
      })
  )

  return services
}
