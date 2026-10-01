import { ArrowLeft, Key01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Form } from "@/components/base/form/form";
import { Input } from "@/components/base/input/input";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

export const Step1ForgotPassword = () => {
    return (
        <section className="min-h-screen overflow-hidden bg-primary px-4 py-12 md:px-8 md:pt-24">
            <div className="mx-auto flex w-full max-w-90 flex-col gap-8">
                <div className="flex flex-col items-center gap-6 text-center">
                    <FeaturedIcon icon={Key01} color="gray" theme="modern" size="lg" />

                    <div className="flex flex-col gap-2 md:gap-3">
                        <h1 className="text-xl font-semibold text-primary md:text-display-xs">Forgot password?</h1>
                        <p className="self-stretch text-md text-tertiary">No worries, we'll send you reset instructions.</p>
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
                    <Input isRequired hideRequiredIndicator label="Email" type="email" name="email" placeholder="Enter your email" size="lg" />

                    <div className="flex flex-col gap-4">
                        <Button type="submit" size="lg">
                            Reset password
                        </Button>
                    </div>
                </Form>

                <div className="flex justify-center gap-1 text-center">
                    <Button size="md" color="link-gray" href="#" className="mx-auto" iconLeading={ArrowLeft}>
                        Back to log in
                    </Button>
                </div>
            </div>
        </section>
    );
};
