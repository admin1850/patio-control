/**
 * Claves del kardex Autorizados.
 * Migración: mientras la columna S (ClaveHash) esté vacía, se compara contra la
 * Clave en texto plano (columna H). Nunca devolver clave ni hash al cliente.
 */

import bcrypt from 'bcryptjs'
import { timingSafeEqual } from 'node:crypto'

const ROUNDS = 10

export function isBcryptHash(value) {
  return typeof value === 'string' && value.startsWith('$2')
}

/** @param {string} plain */
export async function hashClave(plain) {
  const p = String(plain ?? '')
  if (!p) throw new Error('hashClave: clave vacía')
  return bcrypt.hash(p, ROUNDS)
}

function safeEqualStrings(a, b) {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * @param {string} plain clave escrita por el usuario
 * @param {string} hashOrPlain valor guardado (bcrypt `$2…` o texto plano legado)
 * @returns {Promise<boolean>}
 */
export async function verifyClave(plain, hashOrPlain) {
  const p = String(plain ?? '').trim()
  const stored = String(hashOrPlain ?? '').trim()
  if (!p || !stored) return false
  if (isBcryptHash(stored)) {
    try {
      return await bcrypt.compare(p, stored)
    } catch {
      return false
    }
  }
  return safeEqualStrings(p, stored)
}
