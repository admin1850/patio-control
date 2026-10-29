/**
 * Catálogo de variables de Netlify. No contiene secretos.
 * `diagnosticoConfig` dice qué está encendido y qué nombres faltan; nunca devuelve valores.
 */

function lleno(env, name) {
  return Boolean(String(env?.[name] ?? '').trim())
}

export const ENV_CATALOG = [
  {
    feature: 'login-servidor',
    name: 'PATIO_SESSION_SECRET',
    requerida: true,
    nota: 'HMAC de la cookie patio_session. Mínimo 32 caracteres aleatorios. Sin ella el login de servidor responde 503 y la tablet sigue con el kardex en el navegador.',
  },
  {
    feature: 'login-servidor',
    name: 'PATIO_SPREADSHEET_ID',
    requerida: true,
    nota: 'Id del Sheet. El de producción es 1yH8vAbXoMFvHdKEt8XMvXWDOc0R1VjVdp1Y3MtCGLp0.',
  },
  {
    feature: 'login-servidor',
    name: 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    requerida: false,
    nota: 'Una de las dos vías de Sheets. Editor en el Sheet. Si también está el puente de Apps Script, gana la cuenta de servicio.',
  },
  {
    feature: 'login-servidor',
    name: 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    requerida: false,
    nota: 'private_key del JSON de la cuenta de servicio. Los \\n literales se convierten. No hace falta si usas Apps Script.',
  },
  {
    feature: 'login-servidor',
    name: 'PATIO_APPS_SCRIPT_URL',
    requerida: false,
    nota: 'La otra vía de Sheets: URL /exec del Web App. Ver apps-script/README.md.',
  },
  {
    feature: 'login-servidor',
    name: 'PATIO_APPS_SCRIPT_SECRET',
    requerida: false,
    nota: 'El mismo valor que la propiedad de script PATIO_SECRET.',
  },
  {
    feature: 'login-servidor',
    name: 'PATIO_GOOGLE_CLIENT_ID',
    requerida: false,
    nota: 'Solo si el acceso usa el ID token de Google además de la clave del kardex. Varios Client ID separados por coma.',
  },
  {
    feature: 'login-servidor',
    name: 'PATIO_GOOGLE_HOSTED_DOMAIN',
    requerida: false,
    nota: 'Opcional. Ejemplo: camircapital.com.',
  },
  {
    feature: 'login-servidor',
    name: 'PATIO_SESSION_TTL_SEC',
    requerida: false,
    nota: 'Duración de la sesión. Si falta, 43200 (12 h).',
  },
  {
    feature: 'login-servidor',
    name: 'PATIO_ALLOWED_ORIGIN',
    requerida: false,
    nota: 'Orígenes CORS, separados por coma. Recomendado: https://patiocontrol.netlify.app. Sin ella CORS responde *.',
  },
  {
    feature: 'login-servidor',
    name: 'PATIO_DRIVE_FOLDER_ID',
    requerida: false,
    nota: 'Carpeta de evidencias. Si falta, se usa 1Usz_zTK3kqO-Pah3seSdPpMQPMfLHDJh.',
  },
  {
    feature: 'whatsapp',
    name: 'WHATSAPP_TOKEN',
    requerida: true,
    nota: 'Token de WhatsApp Cloud API. Sin este par, el aviso se queda en AvisosLog con canal=log.',
  },
  {
    feature: 'whatsapp',
    name: 'WHATSAPP_PHONE_ID',
    requerida: true,
    nota: 'Phone number id de WhatsApp Cloud API. Las dos hacen falta.',
  },
  {
    feature: 'whatsapp',
    name: 'AVISOS_WHATSAPP_TO',
    requerida: false,
    nota: 'Destino si no hay fila activa en AvisosSuscripciones.',
  },
  {
    feature: 'correo',
    name: 'SENDGRID_API_KEY',
    requerida: false,
    nota: 'Una vía de correo. La otra es SMTP.',
  },
  {
    feature: 'correo',
    name: 'SENDGRID_FROM',
    requerida: false,
    nota: 'Remitente SendGrid. Si falta, se usa SMTP_FROM o patio@camircapital.com.',
  },
  {
    feature: 'correo',
    name: 'SMTP',
    requerida: false,
    nota: 'URL smtp://usuario:clave@host:587 o el host suelto. No pegar la clave en el repo.',
  },
  {
    feature: 'correo',
    name: 'SMTP_HOST',
    requerida: false,
    nota: 'Host SMTP si no usas la URL SMTP.',
  },
  {
    feature: 'correo',
    name: 'SMTP_PORT',
    requerida: false,
    nota: 'Default 587.',
  },
  {
    feature: 'correo',
    name: 'SMTP_USER',
    requerida: false,
    nota: 'Usuario SMTP.',
  },
  {
    feature: 'correo',
    name: 'SMTP_PASS',
    requerida: false,
    nota: 'Clave SMTP. Solo en Netlify.',
  },
  {
    feature: 'correo',
    name: 'SMTP_FROM',
    requerida: false,
    nota: 'Remitente.',
  },
  {
    feature: 'correo',
    name: 'SMTP_SECURE',
    requerida: false,
    nota: '1 para TLS implícito. El puerto 465 también lo activa.',
  },
  {
    feature: 'correo',
    name: 'AVISOS_EMAIL_TO',
    requerida: false,
    nota: 'Destino si no hay suscripción. También vale SMTP_TO.',
  },
  {
    feature: 'correo',
    name: 'SMTP_TO',
    requerida: false,
    nota: 'Alias de AVISOS_EMAIL_TO.',
  },
  {
    feature: 'avisos',
    name: 'AVISOS_CRON_SECRET',
    requerida: false,
    nota: 'Header X-Avisos-Cron si el cron no manda next_run.',
  },
  {
    feature: 'avisos',
    name: 'PARADO_AGING_HORAS',
    requerida: false,
    nota: 'Horas para avisar un parado. Default 48.',
  },
  {
    feature: 'frotcom',
    name: 'FROTCOM_API_URL',
    requerida: true,
    nota: 'Base del GPS. Sin las dos, POST /api/integraciones/frotcom/conciliar responde dryRun y no escribe.',
  },
  {
    feature: 'frotcom',
    name: 'FROTCOM_TOKEN',
    requerida: true,
    nota: 'Bearer de Frotcom. No va en el repo.',
  },
  {
    feature: 'frotcom',
    name: 'PATIO_GEOCERCAS_JSON',
    requerida: false,
    nota: 'JSON [{ yardaId, lat, lng, radioMetros }]. Sin ella no hay geocerca contra la cual conciliar.',
  },
  {
    feature: 'integraciones',
    name: 'PATIO_INTEGRATION_KEY',
    requerida: false,
    nota: 'Valor del header X-Patio-Key para App Chofer, Frotcom y el ERP. No se muestra en la tablet.',
  },
  {
    feature: 'ocr',
    name: 'GOOGLE_VISION_API_KEY',
    requerida: false,
    nota: 'OCR de placas en el servidor. Sin ella la captura sigue en manual. Alias: GCP_VISION_API_KEY.',
  },
  {
    feature: 'ocr',
    name: 'GCP_VISION_API_KEY',
    requerida: false,
    nota: 'Alias de GOOGLE_VISION_API_KEY.',
  },
  {
    feature: 'grok',
    name: 'XAI_API_KEY',
    requerida: false,
    nota: '¿Dudas? y redactar observaciones. Alias: GROK_API_KEY.',
  },
  {
    feature: 'grok',
    name: 'GROK_API_KEY',
    requerida: false,
    nota: 'Alias de XAI_API_KEY.',
  },
  {
    feature: 'grok',
    name: 'XAI_MODEL',
    requerida: false,
    nota: 'Modelo opcional. Alias: GROK_MODEL.',
  },
]

const POR_FEATURE = {
  'login-servidor': ['PATIO_SESSION_SECRET', 'PATIO_SPREADSHEET_ID'],
  whatsapp: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID'],
  frotcom: ['FROTCOM_API_URL', 'FROTCOM_TOKEN'],
}

export function loginServidorListo(env = process.env) {
  const secret = lleno(env, 'PATIO_SESSION_SECRET')
  const sheet = lleno(env, 'PATIO_SPREADSHEET_ID')
  const cuenta = lleno(env, 'GOOGLE_SERVICE_ACCOUNT_EMAIL') && lleno(env, 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  const script = lleno(env, 'PATIO_APPS_SCRIPT_URL') && lleno(env, 'PATIO_APPS_SCRIPT_SECRET')
  return Boolean(secret && sheet && (cuenta || script))
}

export function whatsappListo(env = process.env) {
  return lleno(env, 'WHATSAPP_TOKEN') && lleno(env, 'WHATSAPP_PHONE_ID')
}

export function frotcomListo(env = process.env) {
  return lleno(env, 'FROTCOM_API_URL') && lleno(env, 'FROTCOM_TOKEN')
}

export function correoListo(env = process.env) {
  return lleno(env, 'SENDGRID_API_KEY') || lleno(env, 'SMTP_HOST') || lleno(env, 'SMTP')
}

function faltantes(env, names) {
  return names.filter((name) => !lleno(env, name))
}

/**
 * Inventario para el dueño. Solo banderas y nombres de variables, nunca el valor.
 */
export function diagnosticoConfig(env = process.env) {
  const cuenta = lleno(env, 'GOOGLE_SERVICE_ACCOUNT_EMAIL') && lleno(env, 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  const script = lleno(env, 'PATIO_APPS_SCRIPT_URL') && lleno(env, 'PATIO_APPS_SCRIPT_SECRET')
  const loginFaltan = faltantes(env, POR_FEATURE['login-servidor'])
  if (!cuenta && !script) loginFaltan.push('GOOGLE_SERVICE_ACCOUNT_EMAIL+GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY o PATIO_APPS_SCRIPT_URL+PATIO_APPS_SCRIPT_SECRET')
  return {
    loginServidor: loginServidorListo(env),
    loginServidorFaltan: loginServidorListo(env) ? [] : loginFaltan,
    whatsapp: whatsappListo(env),
    whatsappFaltan: faltantes(env, POR_FEATURE.whatsapp),
    frotcom: frotcomListo(env),
    frotcomFaltan: faltantes(env, POR_FEATURE.frotcom),
    correo: correoListo(env),
    vision: lleno(env, 'GOOGLE_VISION_API_KEY') || lleno(env, 'GCP_VISION_API_KEY'),
    grok: lleno(env, 'XAI_API_KEY') || lleno(env, 'GROK_API_KEY'),
  }
}
