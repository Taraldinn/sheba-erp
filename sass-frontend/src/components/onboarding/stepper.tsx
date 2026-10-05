import { cx as clx } from '@/utils/cx';
import { WIZARD_STEPS } from '@/types/tenant';

interface StepperProps {
    /** 1-based current step index (1..6). */
    current: number;
    /** Optional click handler — by default steps are read-only. */
    onStepClick?: (index: number) => void;
}

export const Stepper = ({ current, onStepClick }: StepperProps) => {
    return (
        <nav aria-label="Onboarding progress" className="w-full">
            <ol className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                {WIZARD_STEPS.map((step, idx) => {
                    const isActive = step.index === current;
                    const isComplete = step.index < current;
                    const clickable = typeof onStepClick === 'function' && (isComplete || isActive);
                    const isLast = idx === WIZARD_STEPS.length - 1;
                    return (
                        <li
                            key={step.key}
                            className="flex flex-1 items-center gap-3"
                            aria-current={isActive ? 'step' : undefined}
                        >
                            <button
                                type="button"
                                disabled={!clickable}
                                onClick={() => clickable && onStepClick?.(step.index)}
                                className={clx(
                                    'group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                                    clickable ? 'cursor-pointer hover:bg-bg-secondary' : 'cursor-default',
                                    isActive ? 'bg-bg-secondary' : '',
                                )}
                            >
                                <span
                                    className={clx(
                                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                                        isComplete && 'border-fg-brand-primary bg-fg-brand-primary text-white',
                                        isActive && !isComplete && 'border-fg-brand-primary text-fg-brand-primary',
                                        !isActive && !isComplete && 'border-border-primary text-tertiary',
                                    )}
                                >
                                    {isComplete ? (
                                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                            <path fillRule="evenodd" d="M16.704 5.296a1 1 0 0 1 0 1.408l-7.5 7.5a1 1 0 0 1-1.408 0l-3.5-3.5a1 1 0 0 1 1.408-1.408L8.5 12.092l6.796-6.796a1 1 0 0 1 1.408 0Z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        step.index
                                    )}
                                </span>
                                <span className="hidden min-w-0 flex-1 text-left sm:block">
                                    <span className={clx(
                                        'block text-sm font-medium',
                                        isActive ? 'text-primary' : isComplete ? 'text-secondary' : 'text-tertiary',
                                    )}>
                                        {step.title}
                                    </span>
                                    <span className="block truncate text-xs text-tertiary">
                                        {step.description}
                                    </span>
                                </span>
                            </button>
                            {!isLast && (
                                <span
                                    aria-hidden="true"
                                    className={clx(
                                        'hidden h-px flex-1 bg-border-secondary sm:block',
                                        isComplete ? 'bg-fg-brand-primary' : '',
                                    )}
                                />
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};