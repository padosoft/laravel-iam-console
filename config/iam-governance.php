<?php

declare(strict_types=1);

/*
 * Configurazione IGA / Governance (doc 14). Ogni feature di governance è governata dalla primitiva
 * FeatureScope sulla cascata layer→app→role→user. Default SICURI (off/detect) e non invasivi: chi
 * non vuole una feature non la vede. `permission` = gate d'uso valutato dal PDP.
 */
return [
    'features' => [
        'access_review' => [
            'default' => 'on',                 // governance "buona" attiva di default
            'permission' => 'iam:access_review.manage',
        ],
        'access_request' => [
            'default' => 'off',                // privacy-by-default: catalogo vuoto finché non abilitato
            'permission' => 'iam:access_request.use',
        ],
        'pim' => [
            'default' => 'off',                // non invasivo: si accende solo dove serve
            'permission' => 'iam:pim.activate',
        ],
        'sod' => [
            'default' => 'detect',             // osserva senza bloccare
        ],
        'least_privilege' => [
            'default' => 'on',
            'permission' => 'iam:least_privilege.view',
        ],
        'anomaly_detection' => [
            'default' => 'on',
            'permission' => 'iam:anomaly.view',
        ],
    ],

    // Combinazioni tossiche di permessi (SoD, doc 14 §6 / doc 04 §15).
    'toxic_combinations' => [],

    // Soglie del recommender deterministico di least-privilege (doc 14 §7).
    'least_privilege' => [
        'unused_days' => 90,         // grant non usato da N giorni → candidato a revoca
        'dormant_days' => 90,        // account senza login da N giorni → dormiente
        'wide_role_permissions' => 50, // ruolo con più di N permessi → troppo ampio
    ],
];
