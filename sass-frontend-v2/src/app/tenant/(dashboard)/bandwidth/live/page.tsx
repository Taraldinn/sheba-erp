import { redirect } from 'next/navigation';

export default function BandwidthLiveRedirect() {
    redirect('/tenant/bandwidth');
}
