const preventNav = (e) => e.preventDefault();
const secureSignIn = (window.__VIPL_CONFIG__ || {}).authMode === 'supabase';

/**
 * Two-step sign-in screen.
 *  Step 1 — Username + Password (#loginStepCreds)
 *  Step 2 — 4-digit verification code (#loginStepOtp), shown only after step 1 matches.
 * The engine (28-init.js: attemptLogin / attemptOtpVerify) attaches the handlers and
 * toggles the steps, so the ids below must stay as they are.
 */
export default function LoginOverlay() {
  return (
    <div className="loginOverlay" id="loginOverlay">
      <div className="loginBox">
        <div className="lh">
          <div className="lt1"><span className="v-logo">V</span>VIPL ERP</div>
          <div className="lt2">Visalam Industries Pvt Ltd — Works Management</div>
          {/* Shows which sign-in is active: Supabase Auth logins vs. the old ERP passwords. */}
          <div className="lt2" style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 10.5 }}>
            {secureSignIn ? '🔒 Secure sign-in (Supabase)' : 'Classic sign-in'}
          </div>
        </div>

        <div id="loginStepCreds">
          <div className="field">
            <label>Username</label>
            <input id="loginUser" placeholder="admin" autoComplete="username" />
          </div>
          <div className="field">
            <label>Password</label>
            <input id="loginPass" type="password" placeholder="••••••" autoComplete="current-password" />
          </div>
          <div className="loginErr" id="loginErr">Invalid username or password.</div>
          <div className="loginStatus" id="loginStatus" style={{ display: 'none' }}>
            <span className="loginSpinner" />
            <span id="loginStatusText">Connecting to Database…</span>
          </div>
          <button className="btn amber" id="loginBtn" style={{ width: '100%', marginTop: 6 }}>Sign In</button>
        </div>

        {/* No SMS/Email gateway is configured, so the engine shows the generated code on
            screen (and in a toast) instead of silently failing to deliver it. */}
        <div id="loginStepOtp" style={{ display: 'none' }}>
          <div className="field" style={{ textAlign: 'center', marginBottom: 14 }}>
            <label style={{ marginBottom: 2 }}>Enter Verification Code</label>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              A 4-digit code has been generated for <b id="otpForUser" />. Enter it below to continue.
            </div>
          </div>
          <div className="field">
            <input
              id="loginOtp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              placeholder="••••"
              style={{
                textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 800,
                letterSpacing: 14, padding: '10px 0 10px 14px',
              }}
            />
          </div>
          <div
            id="otpDemoNote"
            style={{ fontSize: 10.5, color: 'var(--text-dim)', textAlign: 'center', margin: '-8px 0 12px', fontFamily: 'var(--mono)' }}
          />
          <div className="loginErr" id="otpErr">Incorrect code. Please try again.</div>
          <button className="btn amber" id="otpVerifyBtn" style={{ width: '100%', marginTop: 6 }}>Verify &amp; Continue</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11 }}>
            <a href="#" id="otpBackLink" onClick={preventNav} style={{ color: 'var(--text-dim)' }}>← Back</a>
            <a href="#" id="otpResendLink" onClick={preventNav} style={{ color: 'var(--steel,#3a8dff)' }}>Resend Code</a>
          </div>
        </div>
      </div>
    </div>
  );
}
