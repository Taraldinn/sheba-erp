<?php
namespace App\Drivers;
use App\Services\SnmpClient;
interface DriverInterface {
    public function name(): string;
    public function probeOid(): string;
    /** @return array<int,array<string,mixed>> */
    public function collectOnus(SnmpClient $snmp,array $olt): array;
}
