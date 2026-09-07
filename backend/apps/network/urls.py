from rest_framework.routers import DefaultRouter
from .views import RouterViewSet, OLTViewSet, ONUViewSet, UserSessionViewSet, POPBranchViewSet

router = DefaultRouter()
router.register(r'routers', RouterViewSet, basename='router')
router.register(r'olts', OLTViewSet, basename='olt')
router.register(r'onus', ONUViewSet, basename='onu')
router.register(r'branches', POPBranchViewSet, basename='branch')
router.register(r'user-sessions', UserSessionViewSet, basename='user-session')

urlpatterns = router.urls
