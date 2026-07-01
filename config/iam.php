<?php

declare(strict_types=1);

/*
 * Configurazione di Laravel IAM Server.
 * I valori sono Draft v1 e si arricchiscono milestone per milestone (vedi laravel-iam-docs/08 §8).
 */

return [

    // Il server possiede lo schema; opt-out possibile (es. se gestisci tu le migration).
    'run_migrations' => env('IAM_RUN_MIGRATIONS', true),

    // M5 — Identity & Session (doc 10)
    'authentication' => [
        'hashing' => 'argon2id',
        'password_policy' => [
            'min_length' => 12,
            'breached_check' => true, // have-i-been-pwned k-anonymity
            'history' => 5,
        ],
        'lockout' => ['max_attempts' => 5, 'decay_seconds' => 900, 'step_up_after' => 3],
        'passkeys' => ['enabled' => true, 'rp_name' => env('IAM_RP_NAME', 'Laravel IAM')],
        'session' => [
            'idle_timeout' => 1800,       // 30m
            'absolute_timeout' => 43200,  // 12h (mai esteso)
            'step_up_window' => 300,      // 5m
            'concurrent_limit' => null,   // null = off
        ],
    ],

    // M4 — OAuth/OIDC (doc 13)
    'tokens' => [
        'issuer' => env('IAM_ISSUER'), // default: app.url
        'access_ttl' => 900,
        'refresh_ttl' => 1209600,
        'signing_alg' => 'ES256', // RS256 | ES256 | EdDSA
        'introspection_for_critical' => true,
    ],

    // M4b — motore OAuth (league/oauth2-server). Le state-machine dei grant sono di league;
    // qui configuriamo TTL, grant abilitati e la chiave di cifratura per auth code/refresh.
    'oauth' => [
        'route_prefix' => 'oauth',
        'register_routes' => true,
        'rate_limit' => 60,             // richieste/minuto sugli endpoint OAuth (anti-abuse, doc 13 §9)
        'auth_code_ttl' => 600,        // 10m
        'require_pkce' => true,         // PKCE S256 obbligatorio per i client public (doc 13 §9)
        'grants' => [
            'client_credentials' => true,
            'authorization_code' => true,
            'refresh_token' => true,
        ],
        // Chiave di cifratura league (base64, 32 byte) per auth code/refresh token.
        // Vuota in dev → derivata da APP_KEY (vedi IamServiceProvider::resolveOauthEncryptionKey).
        'encryption_key' => env('IAM_OAUTH_ENCRYPTION_KEY'),
    ],

    // M10 — Admin API (doc 16)
    'admin' => [
        'route_prefix' => 'api/iam/v1',
        'register_routes' => false,
        'rate_limit' => 120,            // richieste/minuto sull'Admin API (per-client+IP)
        // Audience attesa dell'access token admin: se valorizzata, un token con `aud` diverso è
        // rifiutato (fail-closed). Vuota = qualunque token IAM valido (utile in dev).
        'audience' => env('IAM_ADMIN_AUDIENCE'),
    ],

    // M17 — Directory module (doc 19 §5). Il server possiede la CONFIG delle sorgenti (CRUD sempre
    // disponibile); i trigger sync/test sono delegati al modulo padosoft/laravel-iam-directory. Se non
    // attivo, l'Admin API risponde 409 sui trigger (degradazione pulita, non 500).
    'directory' => [
        'enabled' => env('IAM_DIRECTORY_ENABLED', false),
    ],

    // M3 — Crypto/KMS (doc 11)
    'crypto' => [
        'driver' => env('IAM_KMS_DRIVER', 'local'), // local | aws | vault(v2) | azure(v2) | gcp(v2)
        'kek' => env('IAM_KEK'), // KEK base64 (32 byte). Vuoto in dev → derivata da APP_KEY.
        'openssl_config' => env('IAM_OPENSSL_CONF'), // path openssl.cnf (necessario su Windows per la keygen EC)
        'keys_path' => storage_path('keys'),
        'aws' => ['kms_key_id' => env('IAM_AWS_KMS_KEY_ID'), 'region' => env('AWS_DEFAULT_REGION')],
    ],

    // M7 — Audit (doc 12)
    'audit' => [
        'stream' => 'organization', // organization | global
        'ip_mode' => env('IAM_AUDIT_IP_MODE', 'hash'), // full | hash | none
        'ip_pepper' => env('IAM_AUDIT_IP_PEPPER'),
        'ua_mode' => env('IAM_AUDIT_UA_MODE', 'hash'),
        'export' => ['format' => 'ocsf', 'sink' => env('IAM_AUDIT_SINK')], // ELK/SIEM
    ],

    // M14 — Observability / deploy base. Tracer: null (default, zero deps) | log (span/errori →
    // canale di log strutturato, spedito a OTLP/ELK da un collector). Health/ready non autenticati.
    'observability' => [
        'tracer' => env('IAM_TRACER', 'null'),       // null | log
        'log_channel' => env('IAM_TRACER_CHANNEL'),  // null = canale di default
        'register_health_routes' => true,
    ],

    // M8 — Governance / IGA (doc 14)
    'governance' => [
        'features' => [
            'access_review' => ['default' => 'on', 'permission' => 'iam:access_review.manage'],
            'access_request' => ['default' => 'off', 'permission' => 'iam:access_request.use'],
            'pim' => ['default' => 'off', 'permission' => 'iam:pim.activate'],
            'sod' => ['default' => 'detect'],
        ],
        'toxic_combinations' => [
            // ['key' => 'self_approval', 'permissions' => ['iam:policies.manage', 'iam:policies.approve'], 'severity' => 'high'],
        ],
    ],

    // M11 — AI (doc 15) — advisory-only, off di default, sovrano
    'ai' => [
        'enabled' => env('IAM_AI_ENABLED', false),
        'provider' => env('IAM_AI_PROVIDER', 'regolo'), // regolo (UE) | ollama (on-prem) | azure | bedrock — MAI openai default
        'model' => env('IAM_AI_MODEL'),
        'redaction' => true,
        'store_prompts' => false,
        'store_outputs' => true,
        'max_context_events' => 500,
    ],

    // M? — MCP (doc 13/15) — v2
    'mcp' => [
        'enabled' => env('IAM_MCP_ENABLED', false),
        'require_oauth' => true,
        'dry_run_mutations_by_default' => true,
    ],

    // Integrazioni opzionali (auto-detect via class_exists)
    'integrations' => [
        'rebel' => ['enabled' => env('IAM_REBEL_ENABLED', 'auto')],
        'invitations' => ['enabled' => env('IAM_INVITATIONS_ENABLED', 'auto')],
    ],
];
