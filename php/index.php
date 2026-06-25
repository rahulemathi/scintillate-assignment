<?php
$webhookUrl = 'https://n8n.rahulemathi.in/webhook/n8n-linkedin';
$webhookUser = 'demo';   // replace with your Basic Auth username
$webhookPass = 'demo';   // replace with your Basic Auth password

$success = false;
$error = null;
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Sanitize inputs
    $name        = trim($_POST['name'] ?? '');
    $email       = trim($_POST['email'] ?? '');
    $title       = trim($_POST['title'] ?? '');
    $company     = trim($_POST['company'] ?? '');
    $company_size= trim($_POST['company_size'] ?? '');
    $industry    = trim($_POST['industry'] ?? '');
    $linkedin_url= trim($_POST['linkedin_url'] ?? '');
    $funding     = trim($_POST['funding_status'] ?? '');
    $geography   = trim($_POST['geography'] ?? '');

    // Basic validation
    if (empty($name))    $errors['name']    = 'Name is required.';
    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL))
                         $errors['email']   = 'Valid email is required.';
    if (empty($title))   $errors['title']   = 'Job title is required.';
    if (empty($company)) $errors['company'] = 'Company is required.';

    if (empty($linkedin_url)) $errors['linkedin_url'] = 'LinkedIn profile is required.';

    if (empty($errors)) {
        // --- Scoring logic (mirrors n8n Code node) ---
        $score = 0;
        $breakdown = [];

        $seniorRoles = ['VP', 'Director', 'Head of', 'CRO', 'Chief Revenue', 'Founder', 'Co-founder', 'CEO'];
        foreach ($seniorRoles as $role) {
            if (stripos($title, $role) !== false) {
                $score += 30;
                $breakdown['role'] = 30;
                break;
            }
        }

        $goodSizes = ['11-50', '51-200'];
        if (in_array($company_size, $goodSizes)) {
            $score += 20;
            $breakdown['size'] = 20;
        }

        $goodFunding = ['Seed', 'Series A', 'Series B'];
        if (in_array($funding, $goodFunding)) {
            $score += 25;
            $breakdown['funding'] = 25;
        }

        $goodIndustries = ['SaaS', 'Fintech', 'EdTech', 'HealthTech', 'Technology', 'Software'];
        foreach ($goodIndustries as $ind) {
            if (stripos($industry, $ind) !== false) {
                $score += 15;
                $breakdown['industry'] = 15;
                break;
            }
        }

        if (!empty($email)) {
            $score += 10;
            $breakdown['email'] = 10;
        }

        // --- Build payload ---
        $payload = json_encode([
            'name'            => $name,
            'email'           => $email,
            'title'           => $title,
            'company'         => $company,
            'company_size'    => $company_size,
            'industry'        => $industry,
            'linkedin_url'    => $linkedin_url,
            'funding_status'  => $funding,
            'geography'       => $geography,
            'score'           => $score,
            'score_breakdown' => $breakdown,
            'source'          => 'php_form',
            'status'          => 'new',
            'created_at'      => date('c'),
        ]);

        // --- Send to n8n webhook with Basic Auth ---
        $ch = curl_init($webhookUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_USERPWD        => $webhookUser . ':' . $webhookPass,
            CURLOPT_TIMEOUT        => 10,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            $error = 'Could not reach the server. Please try again.';
        } elseif ($httpCode >= 200 && $httpCode < 300) {
            $success = true;
        } else {
            $error = 'Submission failed (HTTP ' . $httpCode . '). Please try again.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Request a Demo — LeadGen</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: { brand: { 50:'#eef2ff', 500:'#6366f1', 600:'#4f46e5', 700:'#4338ca' } }
                }
            }
        }
    </script>
    <style>
        .fade-in { animation: fadeIn .4s ease; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .input-field {
            @apply w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800
                   placeholder-slate-400 shadow-sm transition
                   focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20;
        }
        .input-error { @apply border-red-400 focus:border-red-500 focus:ring-red-500/20; }
    </style>
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center px-4 py-12">

    <!-- Background blobs -->
    <div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div class="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl"></div>
        <div class="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl"></div>
    </div>

    <div class="relative w-full max-w-lg fade-in">

        <!-- Card -->
        <div class="rounded-2xl bg-white shadow-2xl overflow-hidden">

            <!-- Header -->
            <div class="bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-7">
                <div class="flex items-center gap-3 mb-1">
                    <div class="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                        <svg class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                    </div>
                    <span class="text-white font-semibold text-lg tracking-tight">LeadGen</span>
                </div>
                <h1 class="text-white text-2xl font-bold mt-3">Request a Demo</h1>
                <p class="text-indigo-200 text-sm mt-1">See how LeadGen automates your B2B prospecting pipeline.</p>
            </div>

            <!-- Body -->
            <div class="px-8 py-7">

                <?php if ($success): ?>
                <!-- Success state -->
                <div class="fade-in text-center py-6">
                    <div class="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                        <svg class="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                    <h2 class="text-xl font-bold text-slate-800">You're on the list!</h2>
                    <p class="text-slate-500 text-sm mt-2">We've received your request and our team will be in touch within 24 hours.</p>
                    <button onclick="window.location.reload()"
                        class="mt-6 text-sm text-indigo-600 hover:text-indigo-700 font-medium underline underline-offset-2">
                        Submit another request
                    </button>
                </div>

                <?php else: ?>

                <?php if ($error): ?>
                <div class="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                    <svg class="h-4 w-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <?= htmlspecialchars($error) ?>
                </div>
                <?php endif; ?>

                <form method="POST" action="" novalidate class="space-y-4">

                    <!-- Name + Email -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-slate-600 mb-1.5">Full Name <span class="text-red-500">*</span></label>
                            <input type="text" name="name"
                                value="<?= htmlspecialchars($_POST['name'] ?? '') ?>"
                                placeholder="Rahul Mathi"
                                class="input-field <?= isset($errors['name']) ? 'input-error' : '' ?>">
                            <?php if (isset($errors['name'])): ?>
                                <p class="mt-1 text-xs text-red-500"><?= $errors['name'] ?></p>
                            <?php endif; ?>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-slate-600 mb-1.5">Work Email <span class="text-red-500">*</span></label>
                            <input type="email" name="email"
                                value="<?= htmlspecialchars($_POST['email'] ?? '') ?>"
                                placeholder="rahul@company.com"
                                class="input-field <?= isset($errors['email']) ? 'input-error' : '' ?>">
                            <?php if (isset($errors['email'])): ?>
                                <p class="mt-1 text-xs text-red-500"><?= $errors['email'] ?></p>
                            <?php endif; ?>
                        </div>
                    </div>

                    <!-- Title + Company -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-slate-600 mb-1.5">Job Title <span class="text-red-500">*</span></label>
                            <input type="text" name="title"
                                value="<?= htmlspecialchars($_POST['title'] ?? '') ?>"
                                placeholder="VP of Sales"
                                class="input-field <?= isset($errors['title']) ? 'input-error' : '' ?>">
                            <?php if (isset($errors['title'])): ?>
                                <p class="mt-1 text-xs text-red-500"><?= $errors['title'] ?></p>
                            <?php endif; ?>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-slate-600 mb-1.5">Company Name <span class="text-red-500">*</span></label>
                            <input type="text" name="company"
                                value="<?= htmlspecialchars($_POST['company'] ?? '') ?>"
                                placeholder="Acme Inc."
                                class="input-field <?= isset($errors['company']) ? 'input-error' : '' ?>">
                            <?php if (isset($errors['company'])): ?>
                                <p class="mt-1 text-xs text-red-500"><?= $errors['company'] ?></p>
                            <?php endif; ?>
                        </div>
                    </div>

                    <!-- Company Size + Industry -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-slate-600 mb-1.5">Company Size</label>
                            <select name="company_size" class="input-field">
                                <option value="" disabled <?= empty($_POST['company_size']) ? 'selected' : '' ?>>Select size</option>
                                <?php foreach (['1-10','11-50','51-200','201-500','500+'] as $s): ?>
                                    <option value="<?= $s ?>" <?= ($_POST['company_size'] ?? '') === $s ? 'selected' : '' ?>><?= $s ?> employees</option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-slate-600 mb-1.5">Industry</label>
                            <select name="industry" class="input-field">
                                <option value="" disabled <?= empty($_POST['industry']) ? 'selected' : '' ?>>Select industry</option>
                                <?php foreach (['SaaS','Fintech','EdTech','HealthTech','E-commerce','Other'] as $ind): ?>
                                    <option value="<?= $ind ?>" <?= ($_POST['industry'] ?? '') === $ind ? 'selected' : '' ?>><?= $ind ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>

                    <!-- Funding + Geography -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-slate-600 mb-1.5">Funding Stage</label>
                            <select name="funding_status" class="input-field">
                                <option value="" disabled <?= empty($_POST['funding_status']) ? 'selected' : '' ?>>Select stage</option>
                                <?php foreach (['Bootstrapped','Seed','Series A','Series B','Series C+','Public'] as $f): ?>
                                    <option value="<?= $f ?>" <?= ($_POST['funding_status'] ?? '') === $f ? 'selected' : '' ?>><?= $f ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-slate-600 mb-1.5">Geography</label>
                            <select name="geography" class="input-field">
                                <option value="" disabled <?= empty($_POST['geography']) ? 'selected' : '' ?>>Select region</option>
                                <?php foreach (['India','Singapore','UAE','USA','UK','Other'] as $g): ?>
                                    <option value="<?= $g ?>" <?= ($_POST['geography'] ?? '') === $g ? 'selected' : '' ?>><?= $g ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>

                    <!-- LinkedIn URL (optional) -->
                    <div>
                        <label class="block text-xs font-medium text-slate-600 mb-1.5">LinkedIn Profile 
                          <span class="text-red-500">*</span></label>
                        <input type="url" name="linkedin_url"
                            value="<?= htmlspecialchars($_POST['linkedin_url'] ?? '') ?>"
                            placeholder="https://linkedin.com/in/yourprofile"
                            class="input-field" required>
                            <?php if (isset($errors['linkedin_url'])): ?>
                                <p class="mt-1 text-xs text-red-500"><?= $errors['linkedin_url'] ?></p>
                            <?php endif; ?>
                    </div>

                    <!-- Submit -->
                    <button type="submit"
                        class="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800
                               text-white font-semibold text-sm py-3 mt-2
                               transition-all duration-150 shadow-md shadow-indigo-500/30
                               focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                        Request a Demo →
                    </button>

                    <p class="text-center text-xs text-slate-400 mt-2">
                        No spam. Your data is used only to qualify your demo request.
                    </p>

                </form>
                <?php endif; ?>

            </div>
        </div>

        <!-- Footer -->
        <p class="text-center text-xs text-slate-500 mt-4">Powered by <span class="text-indigo-400 font-medium">LeadGen</span> · B2B Prospecting Engine</p>
    </div>

</body>
</html>
