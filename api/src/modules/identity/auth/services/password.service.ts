import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
const scrypt = promisify(scryptCallback)

export function createPasswordService() {
  return {
    async hash(password: string) {
      const salt = randomBytes(16).toString('hex')
      const digest = (await scrypt(password, salt, 64)) as Buffer
      return `${salt}:${digest.toString('hex')}`
    },
    async verify(password: string, stored: string) {
      const [salt, value] = stored.split(':')
      if (!salt || !value || !/^[a-f0-9]{128}$/i.test(value)) return false
      const digest = (await scrypt(password, salt, 64)) as Buffer
      return timingSafeEqual(digest, Buffer.from(value, 'hex'))
    },
  }
}
