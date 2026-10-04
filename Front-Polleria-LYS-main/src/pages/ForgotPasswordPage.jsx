import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as authService from '../services/authService';
import { validateForgotPasswordForm } from '../services/validators';
import Logo from '../components/common/Logo';
import '../styles/login.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading || sentEmail) return;
    setFormError('');
    const fieldErrors = validateForgotPasswordForm({ email });
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setLoading(true);
    try {
      await authService.requestPasswordReset(email);
      setSentEmail(email.trim().toLowerCase());
    } catch (error) { setFormError(error.message || 'No se pudo enviar el correo de recuperación.'); }
    finally { setLoading(false); }
  }
  return <div className="lys-root login-page"><div className="login-page__card">
    <div className="login-page__logo"><Logo size="md" /></div>
    <h1 className="font-display login-page__title">Recupera tu contraseña</h1>
    <p className="login-page__subtitle">Te enviaremos las instrucciones a tu correo electrónico.</p>
    {sentEmail ? <div className="login-page__success" role="status">
      <p>Si existe una cuenta con ese correo, recibirás las instrucciones. Revisa también la carpeta de spam.</p>
      <p>Abre el enlace recibido o continúa si tu correo incluye un código.</p>
      <Link to="/reset-password" state={{ email: sentEmail }} className="login-page__link">Ingresar código del correo</Link>
      <p><button type="button" className="login-page__link" onClick={() => setSentEmail('')}>Solicitar otro correo</button></p>
    </div> : <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="forgot-email" className="login-page__label">Correo electrónico</label>
      <input id="forgot-email" className={`lys-input login-page__input ${errors.email ? 'err' : ''}`}
        type="email" name="email" value={email} autoComplete="email" placeholder="tucorreo@ejemplo.com"
        disabled={loading} onChange={e => { setEmail(e.target.value); setErrors({}); }}
        aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'forgot-email-error' : undefined} />
      {errors.email && <p id="forgot-email-error" className="login-page__field-error">{errors.email}</p>}
      {formError && <p className="login-page__form-error" role="alert">{formError}</p>}
      <button className="btn-ember login-page__submit" disabled={loading}>{loading ? 'Enviando...' : 'Enviar correo de recuperación'}</button>
    </form>}
    <p className="login-page__register"><Link to="/login" className="login-page__link">Volver a iniciar sesión</Link></p>
  </div></div>;
}
