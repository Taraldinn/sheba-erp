<?php
namespace App\Services;
use App\Drivers\{DriverInterface,VsolEponDriver,VsolGponDriver,CDataEponDriver,CDataGponDriver,BdcomEponDriver,BdcomGponDriver,PhotonEponDriver,PhotonGponDriver,GenericDriver};
use RuntimeException;

final class DriverRegistry
{
    public static function profiles(): array
    {
        return [
          'vsol_epon'=>'VSOL · EPON','vsol_gpon'=>'VSOL · GPON','vsol_gpon_1port'=>'VSOL · 1-Port GPON',
          'dm_epon'=>'DM · EPON (VSOL compatible)','dm_gpon'=>'DM · GPON (VSOL compatible)',
          'dbc_epon'=>'DBC · EPON (VSOL compatible)','dbc_gpon'=>'DBC · GPON (VSOL compatible)',
          'photon_epon'=>'Photon · EPON','photon_gpon'=>'Photon · GPON',
          'tbs_epon'=>'TBS · EPON (Photon compatible)','tbs_gpon'=>'TBS · GPON (Photon compatible)',
          'cdata_v2_epon'=>'C-DATA V2 · EPON','cdata_v2_gpon'=>'C-DATA V2 · GPON','cdata_v3_epon'=>'C-DATA V3 · EPON','cdata_v3_gpon'=>'C-DATA V3 · GPON',
          'ecom_v2_epon'=>'ECOM · EPON (C-DATA V2 compatible)','ecom_v2_gpon'=>'ECOM · GPON (C-DATA V2 compatible)',
          'ecom_v3_epon'=>'ECOM · EPON (C-DATA V3 compatible)','ecom_v3_gpon'=>'ECOM · GPON (C-DATA V3 compatible)',
          'bdcom_epon'=>'BDCOM · EPON','bdcom_gpon'=>'BDCOM · GPON','generic'=>'Generic / Custom OID'
        ];
    }
    public static function make(string $profile,?string $json=null): DriverInterface
    {
        return match($profile){
          'vsol_epon','dm_epon','dbc_epon'=>new VsolEponDriver(),
          'vsol_gpon','vsol_gpon_1port','dm_gpon','dbc_gpon'=>new VsolGponDriver(),
          'photon_epon','tbs_epon'=>new PhotonEponDriver(),
          'photon_gpon','tbs_gpon'=>new PhotonGponDriver(),
          'cdata_v2_epon','ecom_v2_epon'=>new CDataEponDriver('V2'),
          'cdata_v3_epon','ecom_v3_epon'=>new CDataEponDriver('V3'),
          'cdata_v2_gpon','ecom_v2_gpon'=>new CDataGponDriver('V2'),
          'cdata_v3_gpon','ecom_v3_gpon'=>new CDataGponDriver('V3'),
          'bdcom_epon'=>new BdcomEponDriver(), 'bdcom_gpon'=>new BdcomGponDriver(),
          'generic'=>new GenericDriver(self::decodeJson($json)), default=>throw new RuntimeException('Unknown driver profile: '.$profile)
        };
    }
    private static function decodeJson(?string $json): array { if(!$json)return []; $x=json_decode($json,true);return is_array($x)?$x:[]; }
    public static function vendorForProfile(string $p): string { return str_starts_with($p,'vsol')?'VSOL':(str_starts_with($p,'dm_')?'DM':(str_starts_with($p,'dbc_')?'DBC':(str_starts_with($p,'photon_')?'Photon':(str_starts_with($p,'tbs_')?'TBS':(str_starts_with($p,'cdata')?'C-DATA':(str_starts_with($p,'ecom')?'ECOM':(str_starts_with($p,'bdcom')?'BDCOM':'Generic'))))))); }
}
