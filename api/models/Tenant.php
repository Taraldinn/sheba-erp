<?php
class Tenant {
    public $id;
    public $name;
    public $subdomain;
    public $status;

    // Usually models encapsulate DB logic.
    // However, in this robust thin-controller architecture, the Auth middleware and Controllers 
    // run the optimized raw queries directly. 
    // This Model serves as a standard entity representation if needed for future ORM refactoring.
}
