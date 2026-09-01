from rest_framework import serializers
from .models import Router, OLT, ONU, UserSession, POPBranch


class POPBranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = POPBranch
        fields = '__all__'


class RouterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Router
        fields = '__all__'
        extra_kwargs = {'password': {'write_only': True}}


class ONUSerializer(serializers.ModelSerializer):
    olt_name = serializers.CharField(source='olt.name', read_only=True)
    signal_status = serializers.SerializerMethodField()

    class Meta:
        model = ONU
        fields = '__all__'

    def get_signal_status(self, obj):
        rx = float(obj.rx_power)
        if rx > -25.0 and rx < -10.0:
            return 'good'
        elif rx >= -27.0 and rx <= -25.0:
            return 'warning'
        else:
            return 'critical'


class OLTSerializer(serializers.ModelSerializer):
    class Meta:
        model = OLT
        fields = '__all__'
        extra_kwargs = {'telnet_password': {'write_only': True}}


class UserSessionSerializer(serializers.ModelSerializer):
    router_name = serializers.CharField(source='router.name', read_only=True)

    class Meta:
        model = UserSession
        fields = '__all__'
