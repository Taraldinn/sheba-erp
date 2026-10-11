"""
Tests for Standardized API Exception Handler (/api/v1/).
Verifies:
1. Validation errors (400) -> code="VALIDATION_ERROR", field_errors populated.
2. Authentication errors (401) -> code="AUTHENTICATION_REQUIRED".
3. Permission errors (403) -> code="PERMISSION_DENIED".
4. Not Found errors (404) -> code="NOT_FOUND".
5. Method Not Allowed (405) -> code="METHOD_NOT_ALLOWED".
6. Throttling errors (429) -> code="RATE_LIMIT_EXCEEDED".
7. Preserving custom error codes and top-level fields for backwards compatibility.
"""
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.test import APISimpleTestCase
from apps.core.exceptions import standardized_exception_handler


class StandardizedExceptionHandlerTests(APISimpleTestCase):
    def test_validation_error_with_field_errors(self):
        exc = exceptions.ValidationError({"username": ["This field is required."], "email": ["Invalid email format."]})
        context = {"view": None, "request": None}
        response = standardized_exception_handler(exc, context)

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "VALIDATION_ERROR")
        self.assertEqual(response.data["code"], "VALIDATION_ERROR")
        self.assertIn("username", response.data["field_errors"])
        self.assertIn("email", response.data["field_errors"])
        # Backwards compatibility: original field keys preserved at top level
        self.assertIn("username", response.data)
        self.assertIn("email", response.data)

    def test_validation_error_with_detail_string(self):
        exc = exceptions.ValidationError("General constraint failure.")
        context = {"view": None, "request": None}
        response = standardized_exception_handler(exc, context)

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "VALIDATION_ERROR")
        self.assertEqual(response.data["code"], "VALIDATION_ERROR")
        self.assertIn("General constraint failure", response.data["message"])

    def test_authentication_required_error(self):
        exc = exceptions.NotAuthenticated()
        context = {"view": None, "request": None}
        response = standardized_exception_handler(exc, context)

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.data["error"], "AUTHENTICATION_REQUIRED")
        self.assertEqual(response.data["code"], "AUTHENTICATION_REQUIRED")
        self.assertIn("Authentication credentials were not provided", response.data["detail"])

    def test_permission_denied_error(self):
        exc = exceptions.PermissionDenied("Staff role lacks billing capability.")
        context = {"view": None, "request": None}
        response = standardized_exception_handler(exc, context)

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["error"], "PERMISSION_DENIED")
        self.assertEqual(response.data["code"], "PERMISSION_DENIED")
        self.assertEqual(response.data["detail"], "Staff role lacks billing capability.")

    def test_not_found_error(self):
        exc = exceptions.NotFound("Customer C-999 not found in tenant.")
        context = {"view": None, "request": None}
        response = standardized_exception_handler(exc, context)

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["error"], "NOT_FOUND")
        self.assertEqual(response.data["code"], "NOT_FOUND")
        self.assertEqual(response.data["detail"], "Customer C-999 not found in tenant.")

    def test_throttled_error(self):
        exc = exceptions.Throttled(wait=45)
        context = {"view": None, "request": None}
        response = standardized_exception_handler(exc, context)

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data["error"], "RATE_LIMIT_EXCEEDED")
        self.assertEqual(response.data["code"], "RATE_LIMIT_EXCEEDED")
        self.assertIn("45 seconds", response.data["detail"])

    def test_method_not_allowed_error(self):
        exc = exceptions.MethodNotAllowed("DELETE")
        context = {"view": None, "request": None}
        response = standardized_exception_handler(exc, context)

        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(response.data["error"], "METHOD_NOT_ALLOWED")
        self.assertEqual(response.data["code"], "METHOD_NOT_ALLOWED")
