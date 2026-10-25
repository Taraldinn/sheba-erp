<?php
// classes/olt_drivers/OLTInterface.php

interface OLTInterface {
    public function getOnuList($interface = '');
    public function getOnuPower($interface = '');
    public function getUptime($interface = '');
    public function rebootOnu($interface, $onu_id = null);
    public function monitorAllOnus();
}
?>
