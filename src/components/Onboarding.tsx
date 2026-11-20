// The two onboarding steps (Welcome → Setup) share this header: the official logo on Deep Blue and a 2-step
// progress indicator, so they read as one flow.
import Logo from './Logo'

export function OnboardingHeader({ step, back }: { step: 1 | 2 | null; back?: React.ReactNode }) {
  return (
    <header className="onboard-top">
      {back ?? <Logo size={30} onDark />}
      {step && (
        <p className="steps">
          <span className="sr-only">Step {step} of 2</span>
          {[1, 2].map((n) => <span key={n} className={`step${n === step ? ' step-on' : ''}`} aria-hidden="true" />)}
        </p>
      )}
    </header>
  )
}
