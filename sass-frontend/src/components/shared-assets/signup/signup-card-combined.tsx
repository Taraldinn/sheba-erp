import { useState } from "react";
import { CheckCircle } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { SocialButton } from "@/components/base/buttons/social-button";
import { Form } from "@/components/base/form/form";
import { HintText } from "@/components/base/input/hint-text";
import { Input, InputBase, TextField } from "@/components/base/input/input";
import { UntitledLogoMinimal } from "@/components/foundations/logo/untitledui-logo-minimal";
import { cx } from "@/utils/cx";

export const SignupCardCombined = () => {
    const [password, setPassword] = useState("");

    return (
        <section className="min-h-screen bg-primary px-4 py-12 sm:bg-secondary md:px-8 md:pt-24 md:pb-[270px]">
            <div className="flex w-full flex-col gap-6 bg-primary sm:mx-auto sm:max-w-110 sm:rounded-2xl sm:px-10 sm:py-8 sm:shadow-sm">
                <div className="flex flex-col items-center gap-6 text-center">
                    <UntitledLogoMinimal />
                    <div className="flex flex-col gap-2 md:gap-3">
                        <h1 className="text-xl font-semibold text-primary md:text-display-xs">Start your free trial</h1>
                        <p className="text-md text-tertiary">Sign up in less than 2 minutes.</p>
                    </div>
                </div>

                <Form
                    onSubmit={(e) => {
                        e.preventDefault();
                        const data = Object.fromEntries(new FormData(e.currentTarget));
                        console.log("Form data:", data);
                    }}
                    className="flex flex-col gap-6"
                >
                    <div className="flex flex-col gap-5">
                        <Input isRequired name="name" placeholder="Enter your name" size="lg" aria-label="Name" />
                        <Input isRequired type="email" name="email" placeholder="Enter your email" size="lg" aria-label="Email" />
                        <TextField aria-label="Password" isRequired size="lg" name="password" value={password} onChange={setPassword} minLength={8}>
                            <InputBase type="password" placeholder="Create a password" />
                            <HintText className="flex items-center gap-1">
                                <CheckCircle
                                    className={cx(
                                        "size-4 stroke-[2.25px] text-fg-quaternary group-invalid:text-fg-error-secondary",
                                        password.length >= 8 && "text-fg-success-primary",
                                    )}
                                />
                                Must be at least 8 characters.
                            </HintText>
                        </TextField>
                    </div>

                    <div className="flex flex-col gap-4">
                        <Button type="submit" size="lg">
                            Get started
                        </Button>
                        <SocialButton social="google" theme="color">
                            Sign up with Google
                        </SocialButton>
                    </div>
                </Form>

                <div className="flex justify-center gap-1 text-center">
                    <span className="text-sm text-tertiary">Already have an account?</span>
                    <Button href="#" color="link-color" size="md">
                        Log in
                    </Button>
                </div>
            </div>
        </section>
    );
};
