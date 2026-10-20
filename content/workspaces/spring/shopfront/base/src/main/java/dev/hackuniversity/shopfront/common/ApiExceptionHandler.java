package dev.hackuniversity.shopfront.common;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.core.PropertyReferenceException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Web layer: the one place exceptions become HTTP answers, as RFC 9457 problems
 * (application/problem+json). Controllers and services only throw. The class this one extends
 * already answers Spring MVC's own errors (bad JSON, a wrong type in the path, an unknown URL),
 * and the two overrides at the bottom add an "errors" map naming each invalid field.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail notFound(NotFoundException failure) {
        return problem(HttpStatus.NOT_FOUND, failure);
    }

    @ExceptionHandler(ConflictException.class)
    ProblemDetail conflict(ConflictException failure) {
        return problem(HttpStatus.CONFLICT, failure);
    }

    @ExceptionHandler(UnprocessableException.class)
    ProblemDetail unprocessable(UnprocessableException failure) {
        return problem(HttpStatus.UNPROCESSABLE_CONTENT, failure);
    }

    // Two requests changed the same row at once, and the @Version check stopped the second.
    @ExceptionHandler(OptimisticLockingFailureException.class)
    ProblemDetail changedConcurrently(OptimisticLockingFailureException failure) {
        return problem(HttpStatus.CONFLICT, "Changed at the same time",
                "Another request changed the same data a moment ago. Try again.");
    }

    // A database constraint refused the change, for example a duplicate that slipped past a service check.
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail breaksAConstraint(DataIntegrityViolationException failure) {
        return problem(HttpStatus.CONFLICT, "Conflicts with existing data",
                "The change breaks a rule the database enforces.");
    }

    // ?sort=colour names a property the entity does not have.
    @ExceptionHandler(PropertyReferenceException.class)
    ProblemDetail unknownSortProperty(PropertyReferenceException failure) {
        return problem(HttpStatus.BAD_REQUEST, "Unknown sort property",
                "Cannot sort by '%s'.".formatted(failure.getPropertyName()));
    }

    @ExceptionHandler(BadCredentialsException.class)
    ProblemDetail wrongPassword(BadCredentialsException failure) {
        return problem(HttpStatus.UNAUTHORIZED, "Unauthorized", "Wrong email or password.");
    }

    // A missing, malformed, or expired token. SecurityConfig sends these here.
    @ExceptionHandler(AuthenticationException.class)
    ProblemDetail unauthenticated(AuthenticationException failure) {
        return problem(HttpStatus.UNAUTHORIZED, "Unauthorized",
                "Send a valid token as Authorization: Bearer <token>. POST /api/auth/token gives you one.");
    }

    @ExceptionHandler(AccessDeniedException.class)
    ProblemDetail forbidden(AccessDeniedException failure) {
        return problem(HttpStatus.FORBIDDEN, "Forbidden", "Your account is not allowed to do this.");
    }

    // Anything else is a bug. Log it once, here, with its stack trace, and tell the client nothing internal.
    @ExceptionHandler(Exception.class)
    ProblemDetail unexpected(Exception failure, HttpServletRequest request) {
        log.error("Unexpected error on {} {}", request.getMethod(), request.getRequestURI(), failure);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error", "Something went wrong on our side.");
    }

    // A @Valid request body failed: one entry per field path, like "lines[1].quantity".
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException failure,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        Map<String, List<String>> messages = new TreeMap<>();
        failure.getBindingResult().getFieldErrors().forEach(error ->
                messages.computeIfAbsent(error.getField(), field -> new ArrayList<>()).add(error.getDefaultMessage()));
        return invalid(failure, failure.getBody(), messages, headers, status, request);
    }

    // A constraint on a @RequestParam or @PathVariable failed: one entry per parameter name.
    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException failure,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        Map<String, List<String>> messages = new TreeMap<>();
        failure.getParameterValidationResults().forEach(result -> result.getResolvableErrors().forEach(error ->
                messages.computeIfAbsent(result.getMethodParameter().getParameterName(), name -> new ArrayList<>())
                        .add(error.getDefaultMessage())));
        return invalid(failure, failure.getBody(), messages, headers, status, request);
    }

    private ResponseEntity<Object> invalid(Exception failure, ProblemDetail problem, Map<String, List<String>> messages,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        // Sorted keys and sorted messages, so the same bad request always gets the same answer.
        Map<String, String> errors = new TreeMap<>();
        messages.forEach((field, list) -> errors.put(field, String.join(", ", list.stream().distinct().sorted().toList())));
        problem.setDetail("Some fields are invalid. See errors.");
        problem.setProperty("errors", errors);
        return handleExceptionInternal(failure, problem, headers, status, request);
    }

    private static ProblemDetail problem(HttpStatus status, ShopException failure) {
        ProblemDetail problem = problem(status, failure.getTitle(), failure.getMessage());
        failure.getProperties().forEach(problem::setProperty);
        return problem;
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        return problem;
    }
}
