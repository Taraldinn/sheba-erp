<?php
$line = "  602   64ee:b7ed:be9c     Dynamic     EPON0/2:6     Aging";
$regex = '/(\d+)\s+([0-9a-fA-F:.\-]{12,17})\s+\S+\s+(?:epon|gpon|pon)?\s?(?:\d+\/)?(\d+):(\d+)/i';

if (preg_match($regex, $line, $matches)) {
    echo "MATCH SUCCESS:\n";
    print_r($matches);
} else {
    echo "MATCH FAILED!\n";
}
?>
