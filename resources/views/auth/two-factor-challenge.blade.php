<!DOCTYPE html>
<html lang="en" style="color-scheme:dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Two-factor · Laravel IAM Console</title>
    <style>
        * { box-sizing: border-box; }
        body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
               background:#0b0f14; color:#e5e7eb; font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
        .card { width:100%; max-width:380px; padding:2rem; background:#111826; border:1px solid #1f2937; border-radius:14px; }
        .brand { display:flex; align-items:center; gap:.6rem; margin-bottom:1.25rem; }
        .dot { width:12px; height:12px; border-radius:50%; background:#0d9488; box-shadow:0 0 12px #0d9488; }
        h1 { font-size:1.15rem; margin:0; font-weight:650; }
        .sub { color:#9ca3af; font-size:.82rem; margin:.15rem 0 0; }
        label { display:block; font-size:.8rem; color:#9ca3af; margin:1rem 0 .35rem; }
        input[type=text] { width:100%; padding:.6rem .75rem; background:#0b0f14; color:#e5e7eb;
               border:1px solid #273244; border-radius:9px; font-size:.95rem; letter-spacing:.15em; }
        input:focus { outline:2px solid #0d9488; outline-offset:1px; border-color:#0d9488; }
        button { width:100%; margin-top:1.4rem; padding:.7rem; background:#0d9488; color:#03211d; border:0; border-radius:9px;
               font-weight:700; font-size:.95rem; cursor:pointer; }
        button:hover { background:#0fb3a3; }
        .err { margin-top:1rem; padding:.6rem .75rem; background:#3b1113; border:1px solid #7f1d1d; color:#fecaca;
               border-radius:9px; font-size:.85rem; }
        .or { margin:1.1rem 0 .2rem; color:#6b7280; font-size:.75rem; text-transform:uppercase; letter-spacing:.1em; }
    </style>
</head>
<body>
    <form class="card" method="POST" action="/two-factor-challenge">
        @csrf
        <div class="brand"><span class="dot"></span>
            <div><h1>Two-factor authentication</h1><p class="sub">Enter the 6-digit code from your authenticator app</p></div>
        </div>

        @if ($errors->any())
            <div class="err">{{ $errors->first() }}</div>
        @endif

        <label for="code">Authentication code</label>
        <input id="code" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" autofocus>

        <div class="or">or use a recovery code</div>
        <input id="recovery_code" type="text" name="recovery_code" autocomplete="off" aria-label="Recovery code">

        <button type="submit">Verify</button>
    </form>
</body>
</html>
