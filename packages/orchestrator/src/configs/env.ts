import { EnvVar, EnvVarType, TypedEnv } from './env.d'

export const EnvVars = [
    'JWT_SECRET',
    'JWT_EXPIRES_IN',

    'MONGODB_USERNAME',
    'MONGODB_PASSWORD',
    'MONGODB_CLUSTER',
    'MONGODB_DATABASE',

    {
        name: 'DEFAULT_USER',
        required: false,
    },
    {
        name: 'DEFAULT_PASSWORD',
        required: false,
    },

    {
        name: 'RABBITMQ_DEFAULT_USER',
        required: false,
    },
    {
        name: 'RABBITMQ_DEFAULT_PASS',
        required: false,
    },

    {
        name: 'GCLOUD_KEYFILE_PATH',
        required: false,
    },
    {
        name: 'GCLOUD_PROJECT_ID',
        required: false,
    },
    {
        name: 'GCLOUD_BUCKET',
        required: false,
    },
] as const

export function useEnv<T extends keyof TypedEnv>(key: T): TypedEnv[T] {
    const value = process.env[key]

    if (value === undefined || value === '') {
        const envVar = (EnvVars as unknown as EnvVar[]).find((envVar) => {
            if (typeof envVar === 'string') {
                return envVar === key
            }
            return envVar.name === key
        })

        if (
            envVar &&
            (typeof envVar === 'string' ||
                envVar.required === undefined ||
                envVar.required)
        ) {
            throw new Error(`Missing required environment variable: ${key}`)
        }

        return undefined as unknown as TypedEnv[T]
    }

    switch (typeof EnvTypes[key]) {
        case 'number': {
            const parsedNumber = parseFloat(value)
            if (isNaN(parsedNumber)) {
                throw new Error(
                    `Invalid number for environment variable: ${key}`
                )
            }

            return parsedNumber as unknown as TypedEnv[T]
        }
        case 'boolean': {
            if (value === 'true' || value === '1') {
                return true as unknown as TypedEnv[T]
            } else if (value === 'false' || value === '0') {
                return false as unknown as TypedEnv[T]
            }

            throw new Error(`Invalid boolean for environment variable: ${key}`)
        }
        default:
            return value as unknown as TypedEnv[T]
    }
}

const EnvTypes: Record<string, EnvVarType> = (
    EnvVars as unknown as EnvVar[]
).reduce(
    (acc, cur) => {
        if (typeof cur === 'string') {
            acc[cur] = 'string'
        } else {
            acc[cur.name] = cur.type || 'string'
        }
        return acc
    },
    {} as Record<string, EnvVarType>
)
