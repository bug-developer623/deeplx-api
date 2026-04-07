import process from 'node:process'
import { bodyData, toWebRequest } from 'body-data'
import { parse2DeepLX, translate } from 'deeplx-lib'

type TSourceLanguage = string
type TTargetLanguage = string

interface IParams {
  token: string
}

interface IBody {
  from: string
  to: string
  text: string
  source_lang: string
  target_lang: string
}

function parseToken(token = '') {
  if (Array.isArray(token)) {
    return token
  }
  return token.split(',').filter(Boolean).map(i => i.trim())
}

function authToken({ tokens, authorization, token }: { tokens: string[], authorization: string | null, token: string | undefined }) {
  if (!tokens.length) {
    return true
  }
  if (authorization) {
    authorization = authorization.replace('Bearer ', '').trim()
    return tokens.includes(authorization)
  }
  if (token) {
    return tokens.includes(token)
  }
  return false
}

async function handle(request: Request, token?: string) {
  const url = new URL(request.url)
  const path = url.pathname

  const { params, body } = await bodyData<IParams, IBody>(request, { backContentType: 'application/json; charset=utf-8' })

  const tokens = parseToken(token)
  const authorization = request.headers.get('authorization')
  const auth = authToken({ tokens, authorization, token: params.token })
  if (!auth) {
    const code = 403
    const msg = 'Request missing authentication information'
    return Response.json({ code, msg }, { status: code })
  }

  if (request.method.toUpperCase() === 'POST' && body) {
    if (body.source_lang) {
      body.from = body.source_lang
    }
    if (body.target_lang) {
      body.to = body.target_lang
    }

    body.to = body.to.split('-')[0]

    if (path.startsWith('/translate') && body.to && body.text) {
      const text = body.text
      const from = (body.from || 'AUTO').toUpperCase() as TSourceLanguage
      const to = body.to.toUpperCase() as TTargetLanguage
      const options = { text, from, to }
      const response = await translate(options)
      const translateData = await response.json() as any

      if (translateData.error) {
        const code = response.status
        return Response.json({ code, ...translateData }, { status: code })
      }

      const responseData = parse2DeepLX({ ...options, ...translateData })
      return Response.json(responseData, { status: response.status })
    }

    const code = 404
    return Response.json({ code, msg: 'Not found' }, { status: code })
  }

  const code = 404
  return Response.json({ code, msg: 'Not found' }, { status: code })
}

const token = process.env.token

export default async function (request: Request) {
  const METHODS = ['GET', 'HEAD', 'POST', 'OPTIONS']
  const method = request.method || 'GET'
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': METHODS.join(', '),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
  })

  if (!METHODS.includes(method)) {
    return new Response(null, { status: 405, headers })
  }

  if (method === 'HEAD') {
    return new Response(null, { headers, status: 200 })
  }

  if (method === 'OPTIONS') {
    return new Response(null, { headers })
  }

  const webRequest = toWebRequest(request) as Request
  const data = await handle(webRequest, token).then(r => r.json())

  return new Response(JSON.stringify(data), {
    headers,
    status: data.code,
  })
}

export const config = {
  path: '/*',
}
