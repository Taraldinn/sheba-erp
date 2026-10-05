import { ArrowLeft, Mail01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

export const Step1CheckEmail = () => {
    return (
        <section className="flex min-h-screen flex-1 overflow-hidden bg-primary px-4 py-12 md:px-8 md:pt-24">
            <div className="mx-auto flex w-full max-w-90 flex-col gap-8">
                <div className="flex flex-col items-center gap-6 text-center">
                    <FeaturedIcon icon={Mail01} color="gray" theme="modern" size="lg" />

                    <div className="flex flex-col gap-2 md:gap-3">
                        <h1 className="text-xl font-semibold text-primary md:text-display-xs">Check your email</h1>
                        <p className="text-md text-tertiary">
                            We sent a verification link to <span className="font-medium">olivia@untitledui.com</span>
                        </p>
                    </div>
                </div>

                <div className="flex flex-col">
                    <Button type="submit" size="lg">
                        Enter code manually
                    </Button>
                </div>

                <div className="flex justify-center gap-1 text-center">
                    <Button color="link-gray" size="md" href="#" className="mx-auto" iconLeading={ArrowLeft}>
                        Back to log in
                    </Button>
                </div>
            </div>
        </section>
    );
};
